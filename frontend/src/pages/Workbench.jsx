import { Link } from 'react-router-dom'
import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { useApi, Spinner, ErrorBox, Badge, BATCH_STATUS, SHIP_STATUS, TICKET_STATUS, TICKET_TYPE, COMP_STATUS, fmtDate, fmtDay, Modal, Field } from '../components'

export default function Workbench() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useApi('/my/tasks')
  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} />

  return <>
    <h1>{ { picker: '🧺 采摘工作台', packer: '📦 包装工作台', logistics: '🚚 冷链物流工作台', cs: '🎧 客服工作台', farmer: '农场工作台' }[user.role] || '工作台'}</h1>

    {user.role === 'picker' && <PickerBoard plans={data.harvest_plans || []} />}
    {user.role === 'packer' && <PackerBoard batches={data.batches_to_sort || []} />}
    {user.role === 'logistics' && <LogisticsBoard shipments={data.shipments || []} onDone={reload} />}
    {user.role === 'cs' && <CsBoard tickets={data.tickets || []} comps={data.pending_compensations || []} onDone={reload} />}
  </>
}

function PickerBoard({ plans }) {
  return <div className="card">
    <h2>待采摘计划（按成熟度与订单优先级排程）</h2>
    <div className="table-wrap"><table>
      <thead><tr><th>计划日期</th><th>批次</th><th>项目</th><th>优先级规则</th><th>包装规格</th><th>冷链路线</th><th>目标坏果率</th><th>已采(kg)</th><th></th></tr></thead>
      <tbody>{plans.map(p => (
        <tr key={p.batch_id}>
          <td>{fmtDay(p.planned_date)}</td><td><strong>{p.code}</strong></td><td>{p.project_name}</td>
          <td className="small">{p.priority_rule}</td><td className="small">{p.packaging_spec}</td>
          <td className="small">{p.cold_chain_route}</td><td>≤{p.target_bad_rate}%</td>
          <td>{p.picked_kg}</td>
          <td><Link to={`/batches/${p.batch_id}`}><button className="btn-sm">去批次录入过磅</button></Link></td>
        </tr>
      ))}</tbody>
    </table></div>
  </div>
}

function PackerBoard({ batches }) {
  return <div className="card">
    <h2>待分拣批次（果品大小不均时分级隔离，坏果留样）</h2>
    <div className="table-wrap"><table>
      <thead><tr><th>批次</th><th>项目</th><th>状态</th><th>已采摘(kg)</th><th>已分拣(kg)</th><th></th></tr></thead>
      <tbody>{batches.map(b => (
        <tr key={b.batch_id}>
          <td><strong>{b.code}</strong></td><td>{b.project_name}</td>
          <td><Badge map={BATCH_STATUS} value={b.status} /></td>
          <td>{b.picked_kg}</td><td>{b.sorted_kg}</td>
          <td><Link to={`/batches/${b.batch_id}`}><button className="btn-sm">去批次录入分拣</button></Link></td>
        </tr>
      ))}</tbody>
    </table></div>
  </div>
}

function LogisticsBoard({ shipments, onDone }) {
  const [edit, setEdit] = useState(null)
  return <div className="card">
    <h2>待处理运单（临时改址拦截 / 冷链温度 / 分批配送）</h2>
    <div className="table-wrap"><table>
      <thead><tr><th>批次</th><th>订单</th><th>第几批</th><th>承运/单号</th><th>数量</th><th>收件</th><th>标记</th><th>状态</th><th></th></tr></thead>
      <tbody>{shipments.map(s => (
        <tr key={s.id}>
          <td><Link to={`/batches/${s.batch_id}`}>{s.batch_code}</Link></td>
          <td>#{s.order_id}</td><td>第{s.seq}批</td><td className="small">{s.carrier} {s.tracking_no}</td>
          <td>{s.qty_kg}kg/{s.boxes}箱</td>
          <td className="small">{s.receiver_name} {s.receiver_phone}<br />{s.address}</td>
          <td>{s.address_changed && <span className="badge b-amber">改址</span>}</td>
          <td><Badge map={SHIP_STATUS} value={s.status} /></td>
          <td><button className="btn-sm btn-ghost" onClick={() => setEdit(s)}>更新状态</button></td>
        </tr>
      ))}</tbody>
    </table></div>
    {edit && <ShipEdit ship={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); onDone() }} />}
  </div>
}

function ShipEdit({ ship, onClose, onDone }) {
  const [f, setF] = useState({ status: ship.status, address: '', tracking_no: '' })
  const [err, setErr] = useState(null)
  async function submit(e) {
    e.preventDefault(); setErr(null)
    try {
      await api(`/shipments/${ship.id}`, {
        method: 'PATCH',
        body: { status: f.status, address: f.address || undefined, tracking_no: f.tracking_no || undefined }
      })
      onDone()
    } catch (e2) { setErr(e2.message) }
  }
  return <Modal title={`运单更新 #${ship.id}（第${ship.seq}批）`} onClose={onClose}>
    <form onSubmit={submit}>
      <div className="alert">若客户临时改址：更新地址后系统会在该批次工单中留下物流拦截记录。</div>
      <Field label="状态"><select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>
        <option value="planned">待发出</option><option value="in_transit">运输中</option>
        <option value="delivered">已签收</option><option value="exception">异常</option>
      </select></Field>
      <Field label="改址（可选）"><textarea defaultValue={ship.address} onChange={e => setF({ ...f, address: e.target.value })} /></Field>
      <Field label="运单号（可选）"><input defaultValue={ship.tracking_no} onChange={e => setF({ ...f, tracking_no: e.target.value })} /></Field>
      {err && <div className="alert alert-red mt16">{err}</div>}
      <div className="modal-foot"><button className="btn-ghost" type="button" onClick={onClose}>取消</button><button>保存</button></div>
    </form>
  </Modal>
}

function CsBoard({ tickets, comps, onDone }) {
  return <div className="grid grid-2">
    <div className="card">
      <h2>待跟进工单（串联六方处理结果）</h2>
      {tickets.map(t => (
        <div key={t.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div className="flex-between">
            <strong>#{t.id} {TICKET_TYPE[t.type]}</strong><Badge map={TICKET_STATUS} value={t.status} />
          </div>
          <div className="small">{t.title}</div>
          <div className="small muted">{t.batch_code} · {t.project_name} · {t.raised_by_name}</div>
          <Link to={`/batches/${t.batch_id}`}><button className="btn-sm mt8">去批次处理/协调六方</button></Link>
        </div>
      ))}
      {tickets.length === 0 && <div className="muted small">暂无待跟进工单 🎉</div>}
    </div>
    <div className="card">
      <h2>待执行赔付</h2>
      {comps.map(c => (
        <div key={c.id} className="flex-between" style={{ background: '#fafbfa', borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div className="small">
            赔付单 #{c.id} · 工单 #{c.ticket_id}<br />
            { { refund: '现金退款', reissue: '补发果品', insurance_payout: '保险金', coupon: '优惠券' }[c.type]}
            <strong> ¥{Number(c.amount).toFixed(2)}</strong> {c.qty_kg ? `/ ${c.qty_kg}kg` : ''}
            <div className="muted">{c.reason}</div>
          </div>
          <span className="flex" style={{ flexDirection: 'column', gap: 6 }}>
            <Badge map={COMP_STATUS} value={c.status} />
            <button className="btn-sm" onClick={async () => {
              await api(`/compensations/${c.id}`, { method: 'PATCH', body: { status: 'paid' } })
              onDone()
            }}>确认已赔付</button>
          </span>
        </div>
      ))}
      {comps.length === 0 && <div className="muted small">暂无待执行赔付</div>}
    </div>
  </div>
}
