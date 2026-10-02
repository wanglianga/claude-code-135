import { Link } from 'react-router-dom'
import { useState } from 'react'
import { api } from '../api'
import {
  useApi, Spinner, ErrorBox, Badge, ORDER_STATUS, SHIP_STATUS, TICKET_STATUS, TICKET_TYPE,
  COMP_STATUS, Stars, fmtDate, fmtDay, Modal, Field, ProgressBar, CATEGORY
} from '../components'
import { useAuth } from '../auth'

export default function MyAdoptions() {
  const { data: orders, error, loading, reload } = useApi('/my/orders')
  const [openId, setOpenId] = useState(null)

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} />

  return <>
    <h1>我的认养</h1>
    <p className="muted small">在这里核对每份权益是否被公平兑现：农事可追溯、成熟度可查、分批发货、坏果投诉与赔付、成熟度回访与下一季续认。</p>
    <CertVerifier />
    <div className="grid">
      {orders.map(o => {
        const rights = o.shares * Number(o.unit_per_share)
        const pct = rights ? Math.round(Number(o.shipped_kg) / rights * 100) : 0
        const cat = CATEGORY[o.category] || { emoji: '🌾' }
        return (
          <div key={o.id} className="card">
            <div className="flex-between">
              <div>
                <h3 style={{ margin: 0 }}>{cat.emoji} {o.project_name}</h3>
                <div className="small muted">批次 {o.batch_code} · 下单 {fmtDate(o.paid_at)} · {o.shares} 份 · ¥{Number(o.amount).toFixed(2)}</div>
              </div>
              <Badge map={ORDER_STATUS} value={o.status} />
            </div>
            <div className="mt8 flex" style={{ justifyContent: 'space-between' }}>
              <span className="small">权益 {rights} {o.unit} / 已收 {o.shipped_kg} {o.unit}（{pct}%）</span>
              <span className="small muted">预计成熟 {fmtDay(o.est_mature_date)}</span>
            </div>
            <ProgressBar pct={pct} />
            <div className="flex mt8">
              <Link to={`/batches/${o.batch_id}`}><button className="btn-sm btn-ghost">查看批次全景</button></Link>
              <button className="btn-sm btn-ghost" onClick={() => setOpenId(o.id)}>订单详情/改地址/回访</button>
              {o.cert_no && <span className="small" style={{ alignSelf: 'center' }}>🏅 证书 <strong>{o.cert_no}</strong></span>}
            </div>
            {o.tickets?.length > 0 && (
              <div className="mt8 small">
                {o.tickets.map(t => (
                  <span key={t.id} className="badge b-amber" style={{ marginRight: 6 }}>
                    {TICKET_TYPE[t.type]} · {TICKET_LABEL(t.status)}
                  </span>
                ))}
              </div>
            )}
            {openId === o.id && <OrderDetailModal order={o} onClose={() => setOpenId(null)} onDone={() => { setOpenId(null); reload() }} />}
          </div>
        )
      })}
      {orders.length === 0 && <div className="card muted">还没有认养记录，去项目市场看看吧。</div>}
    </div>
  </>
}

function TICKET_LABEL(s) { return { open: '待处理', processing: '处理中', resolved: '已解决', closed: '已关闭' }[s] }

function CertVerifier() {
  const [no, setNo] = useState('')
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(null)
  async function verify() {
    setErr(null); setRes(null)
    try { setRes(await api(`/certificates/verify/${encodeURIComponent(no.trim())}`)) }
    catch (e) { setErr(e.message) }
  }
  return <div className="card">
    <h3>🏅 认养证书查验</h3>
    <div className="flex">
      <input placeholder="输入证书编号，如 CERT-2025-0001" value={no} onChange={e => setNo(e.target.value)} style={{ maxWidth: 320 }} />
      <button onClick={verify} disabled={!no.trim()}>查验</button>
    </div>
    {res && <div className="alert alert-green mt16">
      ✅ 证书有效：{res.project_name}（{res.batch_code}）· 认养人 {res.buyer_name} · {res.shares} 份<br />
      <span className="small">{res.rights_summary}</span>
    </div>}
    {err && <div className="alert alert-red mt16">{err}</div>}
  </div>
}

function OrderDetailModal({ order, onClose, onDone }) {
  const [tab, setTab] = useState('detail')
  const { data: d, reload } = useApi(`/my/orders/${order.id}`, [order.id])
  if (!d) return <Modal title={`订单 #${order.id}`} onClose={onClose}><Spinner /></Modal>
  return (
    <Modal title={`订单 #${order.id} · ${d.project_name}`} onClose={onClose} wide>
      <div className="tabs">
        {[['detail', '发货与权益'], ['address', '临时改地址'], ['ticket', '投诉/争议'], ['revisit', '成熟度回访']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'detail' && (
        <>
          <dl className="kv">
            <dt>认养证书</dt><dd>🏅 {d.certificate_no}</dd>
            <dt>认养权益</dt><dd>{d.shares} 份 × {d.unit_per_share} {d.unit} = {d.shares * Number(d.unit_per_share)} {d.unit}</dd>
            <dt>采摘标准</dt><dd>{d.harvest_standard || '—'}</dd>
            <dt>配送范围</dt><dd>{d.delivery_range || '—'}</dd>
            <dt>权益说明</dt><dd>{d.rights_text || '—'}</dd>
          </dl>
          <h3 className="mt16">分批发货计划与物流</h3>
          <table><thead><tr><th>批次</th><th>承运/单号</th><th>数量</th><th>冷链</th><th>状态</th><th>时间</th></tr></thead>
            <tbody>{d.shipments.map(s => (
              <tr key={s.id}>
                <td>第{s.seq}批{s.address_changed && <span className="badge b-amber">已改址</span>}</td>
                <td className="small">{s.carrier} {s.tracking_no}</td><td>{s.qty_kg}kg</td>
                <td>{s.cold_chain_temp}℃</td><td><Badge map={SHIP_STATUS} value={s.status} /></td>
                <td className="small">{fmtDate(s.shipped_at)}{s.delivered_at ? <br /> : ''}{s.delivered_at ? `签收 ${fmtDate(s.delivered_at)}` : ''}</td>
              </tr>
            ))}</tbody>
          </table>
          {d.shipments.length === 0 && <div className="muted small">尚未发货，成熟采摘后将按批次安排冷链发出。</div>}
          {d.compensations?.length > 0 && <>
            <h3 className="mt16">赔付记录</h3>
            {d.compensations.map(c => <div key={c.id} className="small flex-between" style={{ background: '#fafbfa', padding: '6px 10px', borderRadius: 6, marginBottom: 4 }}>
              <span>{c.type === 'refund' ? '现金退款' : c.type === 'reissue' ? '补发果品' : c.type === 'coupon' ? '优惠券' : '保险金'} ¥{c.amount} {c.qty_kg ? `/${c.qty_kg}kg` : ''} · {c.reason}</span>
              <Badge map={COMP_STATUS} value={c.status} />
            </div>)}
          </>}
          {d.revisit_surveys?.length > 0 && <>
            <h3 className="mt16">我的回访</h3>
            {d.revisit_surveys.map(r => <div key={r.id} className="small">
              总体 <Stars n={r.satisfaction} /> 果品{r.fruit_score ? <Stars n={r.fruit_score} /> : '—'}
              配送{r.delivery_score ? <Stars n={r.delivery_score} /> : '—'}
              服务{r.service_score ? <Stars n={r.service_score} /> : '—'}
              {r.renew_intent && <span className="badge b-green" style={{ marginLeft: 8 }}>愿意下季续认</span>}
              <div className="muted">{r.comment}</div>
            </div>)}
          </>}
        </>
      )}

      {tab === 'address' && <AddressForm order={d} onDone={() => { reload(); onDone() }} />}
      {tab === 'ticket' && <BuyerTicketForm order={d} onDone={() => { reload() }} />}
      {tab === 'revisit' && <RevisitForm order={d} onDone={() => { reload(); onDone() }} />}
    </Modal>
  )
}

function AddressForm({ order, onDone }) {
  const [f, setF] = useState({ receiver_name: order.receiver_name || '', receiver_phone: order.receiver_phone || '', address: order.address || '' })
  const [err, setErr] = useState(null)
  async function submit(e) {
    e.preventDefault(); setErr(null)
    try {
      const r = await api(`/my/orders/${order.id}/address`, { method: 'PATCH', body: f })
      alert(`地址已更新，工单 #${r.ticket_id} 已建立，客服与物流会把拦截结果回填到批次工单中。`)
      onDone()
    } catch (e2) { setErr(e2.message) }
  }
  return <form onSubmit={submit}>
    <div className="alert">仅未出库的发货单可直接改址；已在途的包裹将由物流拦截，处理过程可在批次全景的工单时间线中查看。</div>
    <div className="form-row">
      <Field label="收件人"><input required value={f.receiver_name} onChange={e => setF({ ...f, receiver_name: e.target.value })} /></Field>
      <Field label="电话"><input required value={f.receiver_phone} onChange={e => setF({ ...f, receiver_phone: e.target.value })} /></Field>
    </div>
    <Field label="新收货地址"><textarea required value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></Field>
    {err && <div className="alert alert-red mt16">{err}</div>}
    <div className="modal-foot"><button>提交改址申请</button></div>
  </form>
}

function BuyerTicketForm({ order, onDone }) {
  const [f, setF] = useState({ type: 'bad_fruit', title: '', description: '' })
  const [err, setErr] = useState(null)
  async function submit(e) {
    e.preventDefault(); setErr(null)
    try {
      await api('/tickets', { method: 'POST', body: { batch_id: order.batch_id, order_id: order.id, ...f, title: f.title || TICKET_TYPE[f.type] } })
      alert('工单已提交，农场、客服及相关角色会把处理结果串到同一批次时间线')
      onDone()
    } catch (e2) { setErr(e2.message) }
  }
  return <form onSubmit={submit}>
    <Field label="问题类型"><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>
      {Object.entries(TICKET_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select></Field>
    <Field label="标题"><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
    <Field label="详细描述（数量、照片编号、诉求）"><textarea required value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
    {err && <div className="alert alert-red mt16">{err}</div>}
    <div className="modal-foot"><button>提交工单</button></div>
    {order.tickets?.length > 0 && <div className="mt8 small muted">本订单已有 {order.tickets.length} 张工单，处理进度请看批次全景。</div>}
  </form>
}

function RevisitForm({ order, onDone }) {
  const [f, setF] = useState({ satisfaction: 5, fruit_score: 5, delivery_score: 5, service_score: 5, renew_intent: true, comment: '' })
  const [err, setErr] = useState(null)
  const Star = ({ label, k }) => (
    <Field label={label}>
      <div className="stars" style={{ fontSize: 22 }}>
        {[1, 2, 3, 4, 5].map(n => <span key={n} onClick={() => setF({ ...f, [k]: n })}
          style={{ cursor: 'pointer', color: n <= f[k] ? 'var(--amber)' : '#e0e0e0' }}>★</span>)}
      </div>
    </Field>
  )
  async function submit(e) {
    e.preventDefault(); setErr(null)
    try { await api(`/my/orders/${order.id}/revisit`, { method: 'POST', body: f }); alert('回访已提交，感谢参与下一季续认计划！'); onDone() }
    catch (e2) { setErr(e2.message) }
  }
  return <form onSubmit={submit}>
    <div className="form-row">
      <Star label="总体满意度" k="satisfaction" /><Star label="果品品质" k="fruit_score" />
    </div>
    <div className="form-row">
      <Star label="冷链配送" k="delivery_score" /><Star label="客服与售后" k="service_score" />
    </div>
    <Field label="下一季续认意向">
      <label style={{ margin: 0 }}><input type="checkbox" style={{ width: 'auto', marginRight: 6 }} checked={f.renew_intent}
        onChange={e => setF({ ...f, renew_intent: e.target.checked })} />成熟前优先通知我续认，并享受老认养人权益</label>
    </Field>
    <Field label="评价与建议（果品大小、口感、包装、分批节奏等）"><textarea value={f.comment} onChange={e => setF({ ...f, comment: e.target.value })} /></Field>
    {err && <div className="alert alert-red mt16">{err}</div>}
    <div className="modal-foot"><button>提交回访</button></div>
  </form>
}
