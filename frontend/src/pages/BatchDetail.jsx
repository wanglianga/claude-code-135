import { Link, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import {
  useApi, Spinner, ErrorBox, Badge, BATCH_STATUS, ORDER_STATUS, TICKET_STATUS, TICKET_TYPE,
  SHIP_STATUS, COMP_STATUS, INS_STATUS, fmtDate, fmtDay, Modal, Field, Stars,
  TIMELINE_ICON, ROLE_LABEL, ProgressBar
} from '../components'

let modalOpener = null
function openModal(...args) { modalOpener && modalOpener(...args) }

export default function BatchDetail() {
  const { id } = useParams()
  const { data: b, error, loading, reload } = useApi(`/batches/${id}`, [id])
  const { data: timeline } = useApi(`/batches/${id}/timeline`, [id])
  const { data: report, reload: reloadReport } = useApi(`/batches/${id}/final-report`, [id])
  const [tab, setTab] = useState('timeline')

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} />

  const rightsKg = b.orders.reduce((s, o) => s + Number(o.shares) * Number(b.unit_per_share), 0)
  const pickedKg = b.harvest_records.reduce((s, x) => s + Number(x.picked_kg), 0)
  const shippedKg = b.shipments.reduce((s, x) => s + Number(x.qty_kg), 0)
  const badKg = b.sortings.reduce((s, x) => s + Number(x.bad_kg), 0)
  const fulfillPct = rightsKg ? Math.round((shippedKg / rightsKg) * 100) : 0

  return (
    <>
      <Link to={`/projects/${b.project_id}`} className="small">← 返回 {b.project_name}</Link>
      <div className="card mt16">
        <div className="flex-between">
          <div>
            <h1 style={{ marginBottom: 2 }}>{b.project_name} · 批次 {b.code}</h1>
            <div className="small muted">{b.farm_name} · {b.plot_code} {b.plot_name} · 预计成熟 {fmtDay(b.est_mature_date)}{b.note ? ` · ${b.note}` : ''}</div>
          </div>
          <Badge map={BATCH_STATUS} value={b.status} />
        </div>
        <div className="divider" />
        <div className="grid grid-4">
          <div>
            <div className="small muted">认养权益总量</div>
            <strong style={{ fontSize: 18 }}>{rightsKg} {b.unit}</strong>
            <div className="small muted">{b.orders.length} 笔订单</div>
          </div>
          <div>
            <div className="small muted">实际采摘</div>
            <strong style={{ fontSize: 18, color: 'var(--amber)' }}>{pickedKg.toFixed(1)} {b.unit}</strong>
            <div className="small muted">抽检坏果率 {b.inspections[0] ? `${b.inspections[0].bad_fruit_pct}%` : '—'}</div>
          </div>
          <div>
            <div className="small muted">已发货</div>
            <strong style={{ fontSize: 18, color: 'var(--blue)' }}>{shippedKg.toFixed(1)} {b.unit}</strong>
            <ProgressBar pct={fulfillPct} />
          </div>
          <div>
            <div className="small muted">坏果 / 权益兑现率</div>
            <strong style={{ fontSize: 18, color: badKg ? 'var(--red)' : undefined }}>{badKg.toFixed(1)} {b.unit} · {fulfillPct}%</strong>
            <div className="small muted">认养人可逐笔核对是否公平兑现</div>
          </div>
        </div>
        {b.disasters?.length > 0 && (
          <div className="alert alert-amber mt16">
            ⛈️ 本批次登记 {b.disasters.length} 起天气灾害：
            {b.disasters.map(d => ` ${d.type==='hail'?'冰雹':d.type}（预估减产${d.yield_impact_pct}%、延后${d.mature_delay_days}天）`).join('；')}
          </div>
        )}
      </div>

      <div className="tabs">
        {[['timeline', '🕒 批次全景时间线'], ['farming', '🌱 农事与灾害'], ['maturity', '🔬 成熟·采摘·分拣'],
          ['shipping', '🚚 分批发货'], ['tickets', '🎫 工单·赔付·保险'], ['report', '📑 最终交付报告']].map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'timeline' && <TimelineTab items={timeline || []} report={report} />}
      {tab === 'farming' && <FarmingTab b={b} onDone={reload} />}
      {tab === 'maturity' && <MaturityTab b={b} onDone={reload} />}
      {tab === 'shipping' && <ShippingTab b={b} onDone={reload} />}
      {tab === 'tickets' && <TicketsTab b={b} onDone={reload} />}
      {tab === 'report' && <ReportTab b={b} report={report} onDone={reloadReport} />}
      <ActionModals onDone={reload} />
    </>
  )
}

function TimelineTab({ items, report }) {
  return (
    <div className="card">
      <h2>同一认养批次的全链路串联</h2>
      <p className="small muted">农事投入、天气灾害、成熟抽检、采摘、分拣、分批发货、工单处理、赔付保险与回访全部沉淀在同一条时间线上。</p>
      <div className="timeline mt16">
        {items.map((x, i) => (
          <div key={i} className={`tl-item kind-${x.kind}`}>
            <div className="tl-title">{TIMELINE_ICON[x.kind] || '•'} {x.title}</div>
            <div className="tl-meta">{fmtDate(x.ts)}</div>
            {x.detail && <div className="tl-detail">{x.detail}</div>}
          </div>
        ))}
        {items.length === 0 && <div className="muted">暂无事件</div>}
      </div>
      {report && (
        <div className="alert alert-green mt16">
          📑 批次已完结：实收 {report.total_yield_kg}kg / 发货 {report.shipped_kg}kg / 坏果 {report.bad_kg}kg，
          赔付 ¥{Number(report.compensation_amount).toFixed(2)}，保险 ¥{Number(report.insurance_amount).toFixed(2)}，
          回访均分 {report.revisit_avg ? Number(report.revisit_avg).toFixed(2) : '—'}，净收益 ¥{Number(report.net_income).toFixed(2)}
        </div>
      )}
    </div>
  )
}

function RoleNote({ roles, children }) {
  const { user } = useAuth()
  if (!roles.includes(user.role) && user.role !== 'admin') return null
  return children
}

function FarmingTab({ b, onDone }) {
  return (
    <div className="grid grid-2">
      <div className="card">
        <div className="flex-between"><h3>🌿 农事日志（施肥/用药/照片）</h3>
          <RoleNote roles={['farmer']}><button className="btn-sm" onClick={() => openModal('farmlog', b, onDone)}>＋ 记录农事</button></RoleNote>
        </div>
        {b.farm_logs.map(l => (
          <div key={l.id} className="tl-item">
            <div className="tl-title">{ { farming: '🧑‍🌾', fertilizer: '💩', pesticide: '🧪', weather: '🌦️', photo: '📷' }[l.type] } {l.title}</div>
            <div className="tl-meta">{fmtDate(l.occurred_at)}</div>
            {l.content && <div className="tl-detail">{l.content}</div>}
            {l.photo_urls?.length > 0 && <div className="tl-detail">📷 照片 {l.photo_urls.length} 张：{l.photo_urls.join('、')}</div>}
          </div>
        ))}
        {b.farm_logs.length === 0 && <div className="muted small">暂无农事日志</div>}
      </div>
      <div className="card">
        <div className="flex-between"><h3>⛈️ 天气灾害（冰雹/霜冻/延后）</h3>
          <RoleNote roles={['farmer']}><button className="btn-sm btn-amber" onClick={() => openModal('disaster', b, onDone)}>＋ 登记灾害</button></RoleNote>
        </div>
        {b.disasters.map(d => (
          <div key={d.id} style={{ borderLeft: '3px solid var(--red)', paddingLeft: 10, marginBottom: 12 }}>
            <strong>{ { hail: '冰雹', frost: '霜冻', drought: '干旱', flood: '洪涝', pest: '病虫害', windstorm: '大风', other: '其他' }[d.type] }</strong>
            <span className="badge b-red" style={{ marginLeft: 8 }}>{ { recorded: '已登记', claiming: '理赔中', settled: '已处理' }[d.status] }</span>
            <div className="small muted">{fmtDate(d.occurred_at)} · 预估减产 {d.yield_impact_pct}% · 成熟延后 {d.mature_delay_days} 天</div>
            <div className="small">{d.description}</div>
          </div>
        ))}
        {b.disasters.length === 0 && <div className="muted small">无灾害记录</div>}
      </div>
    </div>
  )
}

function MaturityTab({ b, onDone }) {
  return <>
    <div className="card">
      <div className="flex-between"><h2>🔬 成熟度抽检与预估产量</h2>
        <RoleNote roles={['farmer']}><button className="btn-sm" onClick={() => openModal('inspection', b, onDone)}>＋ 录入抽检</button></RoleNote>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>抽检时间</th><th>样本</th><th>成熟度</th><th>优果率</th><th>坏果率</th><th>糖度</th><th>预估产量</th><th>结论</th></tr></thead>
        <tbody>{b.inspections.map(x => (
          <tr key={x.id}>
            <td>{fmtDate(x.inspected_at)}</td><td>{x.sample_count}</td>
            <td>{x.mature_pct}% {x.mature_pct >= 85 ? <span className="badge b-green">可开采</span> : <span className="badge b-amber">未达标</span>}</td>
            <td>{x.grade_a_pct}%</td><td style={{ color: Number(x.bad_fruit_pct) > 6 ? 'var(--red)' : undefined }}>{x.bad_fruit_pct}%</td>
            <td>{x.sugar_brix}°Bx</td><td>{x.est_yield_kg} kg</td><td className="small muted">{x.note}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {b.inspections.length === 0 && <div className="muted small">暂无抽检记录</div>}
    </div>

    <div className="card">
      <div className="flex-between"><h2>🧺 采摘计划（成熟度/优先级/包装/冷链/坏果率）</h2>
        <RoleNote roles={['farmer']}><button className="btn-sm" onClick={() => openModal('plan', b, onDone)}>＋ 制定采摘计划</button></RoleNote>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>计划日期</th><th>订单优先级</th><th>包装规格</th><th>冷链路线</th><th>目标坏果率</th><th>状态</th></tr></thead>
        <tbody>{b.harvest_plans.map(x => (
          <tr key={x.id}>
            <td>{fmtDay(x.planned_date)}</td><td>{x.priority_rule}</td><td>{x.packaging_spec}</td>
            <td>{x.cold_chain_route}</td><td>≤{x.target_bad_rate}%</td>
            <td><span className={`badge ${x.status === 'done' ? 'b-green' : 'b-amber'}`}>{ { planned: '待执行', in_progress: '进行中', done: '已完成' }[x.status] }</span></td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>

    <div className="grid grid-2">
      <div className="card">
        <div className="flex-between"><h3>采摘过磅记录</h3>
          <RoleNote roles={['picker', 'farmer']}><button className="btn-sm" onClick={() => openModal('harvest', b, onDone)}>＋ 采摘记录</button></RoleNote>
        </div>
        {b.harvest_records.map(x => (
          <div key={x.id} className="small" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
            {fmtDate(x.picked_at)} · {x.picker_name || '采摘工'}：采 <strong>{x.picked_kg}kg</strong>，坏果 {x.bad_kg}kg，工时 {x.work_hours}h
            {x.note ? `（${x.note}）` : ''}
          </div>
        ))}
        {b.harvest_records.length === 0 && <div className="muted small">暂无</div>}
      </div>
      <div className="card">
        <div className="flex-between"><h3>分拣分级与装箱</h3>
          <RoleNote roles={['packer', 'farmer']}><button className="btn-sm" onClick={() => openModal('sorting', b, onDone)}>＋ 分拣记录</button></RoleNote>
        </div>
        {b.sortings.map(x => (
          <div key={x.id} className="small" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
            {fmtDate(x.sorted_at)} · {x.packer_name || '包装员'}：优 <strong style={{ color: 'var(--green)' }}>{x.grade_a_kg}kg</strong> /
            次 {x.grade_b_kg}kg / 坏 <span style={{ color: 'var(--red)' }}>{x.bad_kg}kg</span>，装箱 {x.boxes} 箱（{x.box_spec}）
            {x.note ? `；${x.note}` : ''}
          </div>
        ))}
        {b.sortings.length === 0 && <div className="muted small">暂无</div>}
      </div>
    </div>
  </>
}

function ShippingTab({ b, onDone }) {
  return (
    <div className="card">
      <h2>🚚 订单与分批发货</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>订单</th><th>认养人</th><th>份额</th><th>权益(kg)</th><th>已发(kg)</th><th>状态</th><th>收件信息</th>
          <RoleNote roles={['logistics', 'farmer']}><th>发货操作</th></RoleNote>
        </tr></thead>
        <tbody>{b.orders.map(o => {
          const rights = o.shares * Number(b.unit_per_share)
          return (
            <tr key={o.id}>
              <td>#{o.id}</td><td>{o.buyer_name}</td><td>{o.shares}</td><td>{rights}</td>
              <td><strong>{o.shipped_kg}</strong>{Number(o.shipped_kg) < rights && <span className="small muted">（欠{rights - Number(o.shipped_kg)}）</span>}</td>
              <td><Badge map={ORDER_STATUS} value={o.status} /></td>
              <td className="small">{o.receiver_name} {o.receiver_phone}<br />{o.address}</td>
              <RoleNote roles={['logistics', 'farmer']}>
                <td><button className="btn-sm" onClick={() => openModal('shipment', b, onDone, o)}>安排发货</button></td>
              </RoleNote>
            </tr>
          )
        })}</tbody>
      </table></div>

      <h3 className="mt16">发货单（同一订单可分多批）</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>批次</th><th>订单</th><th>承运/单号</th><th>数量</th><th>冷链温</th><th>收件地址</th><th>状态</th><th>时间</th>
          <RoleNote roles={['logistics', 'farmer']}><th>更新</th></RoleNote>
        </tr></thead>
        <tbody>{b.shipments.map(s => (
          <tr key={s.id}>
            <td>第{s.seq}批{s.address_changed && <span className="badge b-amber" style={{ marginLeft: 4 }}>改址</span>}</td>
            <td>#{s.order_id}</td><td className="small">{s.carrier}<br />{s.tracking_no}</td>
            <td>{s.qty_kg}kg / {s.boxes}箱</td><td>{s.cold_chain_temp}℃</td>
            <td className="small">{s.receiver_name} {s.receiver_phone}<br />{s.address}</td>
            <td><Badge map={SHIP_STATUS} value={s.status} /></td>
            <td className="small">{fmtDate(s.shipped_at)}<br />{s.delivered_at ? `签收 ${fmtDate(s.delivered_at)}` : ''}</td>
            <RoleNote roles={['logistics', 'farmer']}>
              <td><button className="btn-sm btn-ghost" onClick={() => openModal('ship-update', b, onDone, s)}>更新</button></td>
            </RoleNote>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  )
}

function TicketsTab({ b, onDone }) {
  return <div className="grid grid-2">
    <div className="card">
      <div className="flex-between"><h2>🎫 争议工单（六方处理串联）</h2>
        <button className="btn-sm btn-red" onClick={() => openModal('ticket', b, onDone)}>＋ 发起工单</button>
      </div>
      {b.tickets.map(t => <TicketCard key={t.id} t={t} b={b} onDone={onDone} />)}
      {b.tickets.length === 0 && <div className="muted small">暂无工单</div>}
    </div>
    <div className="card">
      <div className="flex-between"><h2>🛡️ 保险理赔与赔付台账</h2>
        <RoleNote roles={['farmer']}><button className="btn-sm" onClick={() => openModal('insurance', b, onDone)}>＋ 报案理赔</button></RoleNote>
      </div>
      {b.insurance_claims.map(x => (
        <div key={x.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div className="flex-between"><strong>保单 {x.policy_no}</strong><Badge map={INS_STATUS} value={x.status} /></div>
          <div className="small muted">报案 {fmtDate(x.created_at)} · 金额 ¥{Number(x.amount).toFixed(2)}
            {x.settled_at ? ` · 结案 ${fmtDate(x.settled_at)}` : ''}</div>
          <div className="small">{x.note}</div>
          <RoleNote roles={['farmer', 'cs']}>
            <select className="mt8" defaultValue="" onChange={async e => {
              if (!e.target.value) return
              await api(`/insurance/${x.id}`, { method: 'PATCH', body: { status: e.target.value } })
              onDone()
            }}>
              <option value="">更新理赔状态…</option>
              <option value="surveying">查勘中</option><option value="approved">已核定</option>
              <option value="paid">已赔付</option><option value="rejected">拒赔</option>
            </select>
          </RoleNote>
        </div>
      ))}
      {b.insurance_claims.length === 0 && <div className="muted small">暂无保险理赔</div>}
    </div>
  </div>
}

function TicketCard({ t, b, onDone }) {
  const [open, setOpen] = useState(false)
  const { data: detail, reload } = useApi(`/tickets/${t.id}`, [t.id])
  const { user } = useAuth()
  const [action, setAction] = useState('')
  const [result, setResult] = useState('')
  const [showComp, setShowComp] = useState(false)

  async function addEvent(status) {
    if (!action.trim()) { alert('请填写处理动作'); return }
    await api(`/tickets/${t.id}/events`, { method: 'POST', body: { action, result, status: status || undefined } })
    setAction(''); setResult(''); reload(); onDone()
  }
  async function addComp(body) {
    await api(`/tickets/${t.id}/compensations`, { method: 'POST', body })
    setShowComp(false); reload()
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div className="flex-between">
        <div><strong>{TICKET_TYPE[t.type]}：{t.title}</strong>
          <span className="tag-role">{ROLE_LABEL[user.role] === undefined ? '' : `#${t.id}`}</span></div>
        <Badge map={TICKET_STATUS} value={t.status} />
      </div>
      <div className="small muted">{t.description}</div>
      <button className="btn-link mt8" onClick={() => setOpen(!open)}>{open ? '收起处理流水' : `展开处理流水（${detail?.events?.length ?? '…'} 条）`}</button>
      {open && detail && (
        <div className="mt8">
          <div className="timeline">
            {detail.events.map(e => (
              <div key={e.id} className="tl-item">
                <div className="tl-title">{e.actor_name || ROLE_LABEL[e.actor_role]} <span className="tag-role">{ROLE_LABEL[e.actor_role]}</span> · {e.action}</div>
                <div className="tl-meta">{fmtDate(e.created_at)}</div>
                {e.result && <div className="tl-detail">{e.result}</div>}
              </div>
            ))}
          </div>
          {detail.compensations?.length > 0 && (
            <div className="mt8">
              {detail.compensations.map(cp => (
                <div key={cp.id} className="small flex-between" style={{ background: '#fafbfa', padding: '6px 10px', borderRadius: 6, marginBottom: 4 }}>
                  <span>💰 { { refund: '现金退款', reissue: '补发果品', insurance_payout: '保险金', coupon: '优惠券' }[cp.type]} ¥{cp.amount} {cp.qty_kg ? `/${cp.qty_kg}kg` : ''} · {cp.reason}</span>
                  <span className="flex">
                    <Badge map={COMP_STATUS} value={cp.status} />
                    {['cs', 'farmer'].includes(user.role) && cp.status !== 'paid' && cp.status !== 'rejected' &&
                      <button className="btn-sm" onClick={async () => { await api(`/compensations/${cp.id}`, { method: 'PATCH', body: { status: 'paid' } }); reload() }}>确认已赔付</button>}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="divider" />
          <Field label={`我（${ROLE_LABEL[user.role]}）的处理动作`}>
            <input placeholder="例：核查过磅单 / 留样比对 / 拦截改址 / 执行退款"
              value={action} onChange={e => setAction(e.target.value)} />
          </Field>
          <Field label="处理结果"><input value={result} onChange={e => setResult(e.target.value)} /></Field>
          <div className="flex mt8">
            <button className="btn-sm" onClick={() => addEvent('')}>提交处理</button>
            <button className="btn-sm btn-ghost" onClick={() => addEvent('resolved')}>提交并标记已解决</button>
            {['cs', 'farmer'].includes(user.role) &&
              <button className="btn-sm btn-amber" onClick={() => setShowComp(!showComp)}>登记赔付方案</button>}
          </div>
          {showComp && <CompForm onSubmit={addComp} t={t} b={b} />}
        </div>
      )}
    </div>
  )
}

function CompForm({ onSubmit, t, b }) {
  const [f, setF] = useState({ order_id: t.order_id || (b.orders[0]?.id || ''), type: 'refund', amount: 0, qty_kg: 0, reason: '', status: 'pending' })
  return <div className="mt8" style={{ background: 'var(--amber-light)', padding: 12, borderRadius: 8 }}>
    <div className="form-row">
      <Field label="关联订单"><select value={f.order_id} onChange={e => setF({ ...f, order_id: e.target.value })}>
        <option value="">不指定</option>{b.orders.map(o => <option key={o.id} value={o.id}>#{o.id} {o.buyer_name}</option>)}
      </select></Field>
      <Field label="赔付方式"><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>
        <option value="refund">现金退款</option><option value="reissue">补发果品</option>
        <option value="insurance_payout">保险金转付</option><option value="coupon">优惠券</option>
      </select></Field>
    </div>
    <div className="form-row">
      <Field label="金额(元)"><input type="number" step="0.01" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
      <Field label="补发数量(kg)"><input type="number" step="0.1" value={f.qty_kg} onChange={e => setF({ ...f, qty_kg: e.target.value })} /></Field>
      <Field label="状态"><select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>
        <option value="pending">待审核</option><option value="approved">已核准</option>
      </select></Field>
    </div>
    <Field label="原因/核算依据"><input value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} placeholder="例：冰雹短少3kg按单价退款" /></Field>
    <button className="btn-sm mt8" onClick={() => onSubmit({
      ...f, order_id: Number(f.order_id) || 0, amount: Number(f.amount), qty_kg: Number(f.qty_kg)
    })}>保存赔付方案</button>
  </div>
}

function ReportTab({ b, report, onDone }) {
  const [busy, setBusy] = useState(false)
  const [suggestion, setSuggestion] = useState('')
  const [summary, setSummary] = useState('')
  async function generate() {
    setBusy(true)
    try {
      await api(`/batches/${b.id}/final-report`, {
        method: 'POST',
        body: { renewal_suggestion: suggestion, summary }
      })
      onDone(); alert('最终交付报告已生成，批次已完结')
    } finally { setBusy(false) }
  }
  return <div className="card">
    <h2>📑 最终交付报告（产量·发货·赔付·回访·续认）</h2>
    {report ? (
      <>
        <div className="grid grid-4">
          <div className="stat"><div className="num">{report.total_yield_kg}</div><div className="label">实际产量(kg)</div></div>
          <div className="stat"><div className="num">{report.shipped_kg}</div><div className="label">累计发货(kg)</div></div>
          <div className="stat"><div className="num" style={{ color: 'var(--red)' }}>{report.bad_kg}</div><div className="label">坏果(kg)</div></div>
          <div className="stat"><div className="num">{report.revisit_avg ? Number(report.revisit_avg).toFixed(2) : '—'}</div><div className="label">回访均分</div></div>
          <div className="stat"><div className="num" style={{ color: 'var(--red)' }}>¥{Number(report.compensation_amount).toFixed(0)}</div><div className="label">认养人赔付</div></div>
          <div className="stat"><div className="num" style={{ color: 'var(--blue)' }}>¥{Number(report.insurance_amount).toFixed(0)}</div><div className="label">保险赔付</div></div>
          <div className="stat"><div className="num">¥{Number(report.cost_total).toFixed(0)}</div><div className="label">地块成本</div></div>
          <div className="stat"><div className="num">¥{Number(report.net_income).toFixed(0)}</div><div className="label">净收益（含保险、扣赔付）</div></div>
        </div>
        <div className="divider" />
        <h3>下一季续认建议</h3>
        <p style={{ whiteSpace: 'pre-wrap' }}>{report.renewal_suggestion}</p>
        {report.summary && <><h3>批次总结</h3><p>{report.summary}</p></>}
        <div className="small muted">生成于 {fmtDate(report.created_at)}，更新于 {fmtDate(report.updated_at)}</div>
      </>
    ) : (
      <>
        <p className="small muted">报告将自动汇总采摘、分拣、发货、赔付、保险、回访与地块成本数据；续认建议可留空由系统按满意度、续认意向、产量缺口与坏果自动生成。</p>
        <Field label="续认建议（可选，留空自动生成）"><textarea value={suggestion} onChange={e => setSuggestion(e.target.value)} /></Field>
        <Field label="批次总结（可选）"><textarea value={summary} onChange={e => setSummary(e.target.value)} /></Field>
        <RoleNote roles={['farmer']}><button className="mt8" disabled={busy} onClick={generate}>{busy ? '生成中…' : '生成最终交付报告并完结批次'}</button></RoleNote>
      </>
    )}
  </div>
}

/* ===== 录入弹窗分发 ===== */
function ActionModals({ onDone }) {
  const [state, setState] = useState(null)
  useEffect(() => { modalOpener = (kind, b, _onDone, extra) => setState({ kind, b, extra }) }, [])
  if (!state) return null
  const close = () => setState(null)
  const done = () => { close(); onDone() }
  const props = { ...state, close, done, b: state.b }
  return <ModalHost {...props} />
}

function ModalHost({ kind, close, done, b, extra }) {
  const titles = {
    farmlog: '记录农事日志', disaster: '登记天气灾害', inspection: '录入成熟度抽检',
    plan: '制定采摘计划', harvest: '采摘过磅记录', sorting: '分拣分级与装箱',
    shipment: `安排发货 · 订单 #${extra?.id}`, 'ship-update': `更新发货单 #${extra?.id}`,
    ticket: '发起争议工单', insurance: '保险报案理赔'
  }
  return (
    <Modal title={titles[kind]} onClose={close} wide>
      {kind === 'farmlog' && <FarmLogForm batch={b} onDone={done} />}
      {kind === 'disaster' && <DisasterForm batch={b} onDone={done} />}
      {kind === 'inspection' && <InspectionForm batch={b} onDone={done} />}
      {kind === 'plan' && <PlanForm batch={b} onDone={done} />}
      {kind === 'harvest' && <HarvestForm batch={b} onDone={done} />}
      {kind === 'sorting' && <SortingForm batch={b} onDone={done} />}
      {kind === 'shipment' && <ShipmentForm batch={b} order={extra} onDone={done} />}
      {kind === 'ship-update' && <ShipUpdateForm ship={extra} onDone={done} />}
      {kind === 'ticket' && <TicketForm batch={b} onDone={done} />}
      {kind === 'insurance' && <InsuranceForm batch={b} onDone={done} />}
    </Modal>
  )
}

function FormShell({ onDone, path, body, children, label = '提交' }) {
  const [err, setErr] = useState(null)
  async function submit(e) {
    e.preventDefault(); setErr(null)
    try {
      await api(path, { method: 'POST', body })
      onDone()
    } catch (e2) { setErr(e2.message) }
  }
  return <form onSubmit={submit}>
    {children}
    {err && <div className="alert alert-red mt16">{err}</div>}
    <div className="modal-foot"><button>{label}</button></div>
  </form>
}

function FarmLogForm({ batch, onDone }) {
  const [f, setF] = useState({ type: 'farming', title: '', content: '', photo_urls: '' })
  const body = { ...f, photo_urls: f.photo_urls ? f.photo_urls.split(/[,，\s]+/).filter(Boolean) : [] }
  return <FormShell path={`/batches/${batch.id}/logs`} body={body} onDone={onDone}>
    <div className="form-row">
      <Field label="类型"><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>
        <option value="farming">农事</option><option value="fertilizer">施肥</option>
        <option value="pesticide">用药</option><option value="weather">天气</option><option value="photo">照片</option>
      </select></Field>
      <Field label="标题"><input required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
    </div>
    <Field label="内容"><textarea value={f.content} onChange={e => setF({ ...f, content: e.target.value })} /></Field>
    <Field label="农事照片（文件名/URL，逗号分隔）"><input value={f.photo_urls} onChange={e => setF({ ...f, photo_urls: e.target.value })} /></Field>
  </FormShell>
}

function DisasterForm({ batch, onDone }) {
  const [f, setF] = useState({ type: 'hail', description: '', yield_impact_pct: 0, mature_delay_days: 0 })
  return <FormShell path={`/batches/${batch.id}/disasters`}
    body={{ ...f, yield_impact_pct: Number(f.yield_impact_pct), mature_delay_days: Number(f.mature_delay_days) }} onDone={onDone}
    label="登记灾害并自动建单">
    <div className="alert alert-amber">登记后将自动顺延预计成熟时间，并向该批次发起一张「冰雹/灾害减产」工单，把农场、客服、物流串联处理。</div>
    <div className="form-row">
      <Field label="灾害类型"><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>
        <option value="hail">冰雹</option><option value="frost">霜冻</option><option value="drought">干旱</option>
        <option value="flood">洪涝</option><option value="pest">病虫害</option><option value="windstorm">大风</option>
        <option value="other">其他</option>
      </select></Field>
      <Field label="预估减产(%)"><input type="number" min="0" max="100" value={f.yield_impact_pct} onChange={e => setF({ ...f, yield_impact_pct: e.target.value })} /></Field>
      <Field label="成熟延后(天)"><input type="number" min="0" value={f.mature_delay_days} onChange={e => setF({ ...f, mature_delay_days: e.target.value })} /></Field>
    </div>
    <Field label="受灾情况描述"><textarea required value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
  </FormShell>
}

function InspectionForm({ batch, onDone }) {
  const [f, setF] = useState({ sample_count: 30, mature_pct: '', grade_a_pct: '', bad_fruit_pct: '', sugar_brix: '', est_yield_kg: '', note: '' })
  const num = v => (v === '' ? null : Number(v))
  return <FormShell path={`/batches/${batch.id}/inspections`}
    body={{ ...f, sample_count: Number(f.sample_count), mature_pct: num(f.mature_pct), grade_a_pct: num(f.grade_a_pct),
      bad_fruit_pct: num(f.bad_fruit_pct), sugar_brix: num(f.sugar_brix), est_yield_kg: num(f.est_yield_kg) }} onDone={onDone}
    label="提交抽检（成熟度≥85%自动进入采摘）">
    <div className="form-row">
      <Field label="样本数"><input type="number" value={f.sample_count} onChange={e => setF({ ...f, sample_count: e.target.value })} /></Field>
      <Field label="成熟度(%)"><input type="number" step="0.1" required value={f.mature_pct} onChange={e => setF({ ...f, mature_pct: e.target.value })} /></Field>
      <Field label="优果率(%)"><input type="number" step="0.1" value={f.grade_a_pct} onChange={e => setF({ ...f, grade_a_pct: e.target.value })} /></Field>
    </div>
    <div className="form-row">
      <Field label="坏果率(%)"><input type="number" step="0.1" value={f.bad_fruit_pct} onChange={e => setF({ ...f, bad_fruit_pct: e.target.value })} /></Field>
      <Field label="糖度(°Bx)"><input type="number" step="0.1" value={f.sugar_brix} onChange={e => setF({ ...f, sugar_brix: e.target.value })} /></Field>
      <Field label="预估产量(kg)"><input type="number" step="0.1" value={f.est_yield_kg} onChange={e => setF({ ...f, est_yield_kg: e.target.value })} /></Field>
    </div>
    <Field label="开采建议/备注"><textarea value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field>
  </FormShell>
}

function PlanForm({ batch, onDone }) {
  const [f, setF] = useState({ planned_date: '', priority_rule: '', packaging_spec: '', cold_chain_route: '', target_bad_rate: 5 })
  return <FormShell path={`/batches/${batch.id}/harvest-plans`}
    body={{ ...f, target_bad_rate: Number(f.target_bad_rate) }} onDone={onDone} label="制定计划">
    <div className="form-row">
      <Field label="计划采摘日期"><input type="date" required value={f.planned_date} onChange={e => setF({ ...f, planned_date: e.target.value })} /></Field>
      <Field label="目标坏果率(%)"><input type="number" step="0.1" value={f.target_bad_rate} onChange={e => setF({ ...f, target_bad_rate: e.target.value })} /></Field>
    </div>
    <Field label="订单优先级规则"><input value={f.priority_rule} onChange={e => setF({ ...f, priority_rule: e.target.value })} placeholder="例：付款时间先后 + 受灾地区优先" /></Field>
    <Field label="包装规格"><input value={f.packaging_spec} onChange={e => setF({ ...f, packaging_spec: e.target.value })} placeholder="例：5斤装泡沫托+天地盖纸箱" /></Field>
    <Field label="冷链路线"><input value={f.cold_chain_route} onChange={e => setF({ ...f, cold_chain_route: e.target.value })} placeholder="例：烟台冷库→潍坊分拨→全国 2-8℃" /></Field>
  </FormShell>
}

function HarvestForm({ batch, onDone }) {
  const plans = batch.harvest_plans
  const [f, setF] = useState({ plan_id: plans[0]?.id || '', picked_kg: '', bad_kg: 0, work_hours: '', note: '' })
  return <FormShell path={`/batches/${batch.id}/harvest-records`}
    body={{ ...f, plan_id: Number(f.plan_id) || 0, picked_kg: Number(f.picked_kg), bad_kg: Number(f.bad_kg),
      work_hours: f.work_hours === '' ? null : Number(f.work_hours) }} onDone={onDone} label="提交过磅">
    <div className="form-row">
      <Field label="采摘计划"><select value={f.plan_id} onChange={e => setF({ ...f, plan_id: e.target.value })}>
        <option value="">不指定</option>{plans.map(p => <option key={p.id} value={p.id}>{fmtDay(p.planned_date)} {p.priority_rule}</option>)}
      </select></Field>
      <Field label="采摘重量(kg)"><input type="number" step="0.1" required value={f.picked_kg} onChange={e => setF({ ...f, picked_kg: e.target.value })} /></Field>
      <Field label="其中坏果(kg)"><input type="number" step="0.1" value={f.bad_kg} onChange={e => setF({ ...f, bad_kg: e.target.value })} /></Field>
      <Field label="工时(h)"><input type="number" step="0.5" value={f.work_hours} onChange={e => setF({ ...f, work_hours: e.target.value })} /></Field>
    </div>
    <Field label="备注"><input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field>
  </FormShell>
}

function SortingForm({ batch, onDone }) {
  const [f, setF] = useState({ grade_a_kg: '', grade_b_kg: 0, bad_kg: 0, boxes: '', box_spec: '', note: '' })
  return <FormShell path={`/batches/${batch.id}/sortings`}
    body={{ ...f, grade_a_kg: Number(f.grade_a_kg), grade_b_kg: Number(f.grade_b_kg), bad_kg: Number(f.bad_kg), boxes: Number(f.boxes) }}
    onDone={onDone} label="提交分拣">
    <div className="form-row">
      <Field label="优级果(kg)"><input type="number" step="0.1" required value={f.grade_a_kg} onChange={e => setF({ ...f, grade_a_kg: e.target.value })} /></Field>
      <Field label="次级果(kg)"><input type="number" step="0.1" value={f.grade_b_kg} onChange={e => setF({ ...f, grade_b_kg: e.target.value })} /></Field>
      <Field label="坏果(kg)"><input type="number" step="0.1" value={f.bad_kg} onChange={e => setF({ ...f, bad_kg: e.target.value })} /></Field>
      <Field label="装箱数"><input type="number" value={f.boxes} onChange={e => setF({ ...f, boxes: e.target.value })} /></Field>
    </div>
    <Field label="箱规"><input value={f.box_spec} onChange={e => setF({ ...f, box_spec: e.target.value })} /></Field>
    <Field label="备注（坏果留样说明）"><input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field>
  </FormShell>
}

function ShipmentForm({ batch, order, onDone }) {
  const nextSeq = batch.shipments.filter(s => s.order_id === order.id).length + 1
  const [f, setF] = useState({ carrier: '顺丰冷运', tracking_no: '', qty_kg: '', boxes: 1, cold_chain_temp: 4 })
  return <FormShell path={`/batches/${batch.id}/shipments`}
    body={{ order_id: order.id, seq: nextSeq, ...f, qty_kg: Number(f.qty_kg), boxes: Number(f.boxes), cold_chain_temp: Number(f.cold_chain_temp) }}
    onDone={onDone} label={`发出第 ${nextSeq} 批`}>
    <div className="alert">订单 #{order.id} {order.buyer_name}：权益 {order.shares * Number(batch.unit_per_share)}kg，已发 {order.shipped_kg}kg。发往：{order.address}</div>
    <div className="form-row">
      <Field label="承运商"><input value={f.carrier} onChange={e => setF({ ...f, carrier: e.target.value })} /></Field>
      <Field label="运单号"><input value={f.tracking_no} onChange={e => setF({ ...f, tracking_no: e.target.value })} /></Field>
    </div>
    <div className="form-row">
      <Field label="本批数量(kg)"><input type="number" step="0.1" required value={f.qty_kg} onChange={e => setF({ ...f, qty_kg: e.target.value })} /></Field>
      <Field label="箱数"><input type="number" value={f.boxes} onChange={e => setF({ ...f, boxes: e.target.value })} /></Field>
      <Field label="冷链温度(℃)"><input type="number" step="0.1" value={f.cold_chain_temp} onChange={e => setF({ ...f, cold_chain_temp: e.target.value })} /></Field>
    </div>
  </FormShell>
}

function ShipUpdateForm({ ship, onDone }) {
  const [f, setF] = useState({ status: ship.status, tracking_no: '', address: '', cold_chain_temp: '' })
  const [err, setErr] = useState(null)
  async function submit(e) {
    e.preventDefault(); setErr(null)
    try {
      await api(`/shipments/${ship.id}`, {
        method: 'PATCH',
        body: { status: f.status, tracking_no: f.tracking_no || undefined, address: f.address || undefined,
          cold_chain_temp: f.cold_chain_temp === '' ? undefined : Number(f.cold_chain_temp) }
      })
      onDone()
    } catch (e2) { setErr(e2.message) }
  }
  return <form onSubmit={submit}>
    <Field label="物流状态"><select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>
      <option value="planned">待发出</option><option value="in_transit">运输中</option>
      <option value="delivered">已签收</option><option value="exception">异常</option>
    </select></Field>
    <Field label="更新运单号（可选）"><input value={f.tracking_no} onChange={e => setF({ ...f, tracking_no: e.target.value })} /></Field>
    <Field label="拦截改址（可选）"><input value={f.address} onChange={e => setF({ ...f, address: e.target.value })} placeholder="客户临时改地址时填写新地址" /></Field>
    <Field label="冷链温度(℃，可选)"><input type="number" step="0.1" value={f.cold_chain_temp} onChange={e => setF({ ...f, cold_chain_temp: e.target.value })} /></Field>
    {err && <div className="alert alert-red mt16">{err}</div>}
    <div className="modal-foot"><button>更新</button></div>
  </form>
}

function TicketForm({ batch, onDone }) {
  const [f, setF] = useState({
    order_id: '', type: 'bad_fruit', title: '', description: ''
  })
  const typeObj = Object.entries(TICKET_TYPE)
  return <FormShell path="/tickets"
    body={{ batch_id: batch.id, order_id: Number(f.order_id) || 0, type: f.type,
      title: f.title || TICKET_TYPE[f.type], description: f.description }} onDone={onDone} label="发起工单">
    <div className="form-row">
      <Field label="问题类型"><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>
        {typeObj.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select></Field>
      <Field label="关联订单"><select value={f.order_id} onChange={e => setF({ ...f, order_id: e.target.value })}>
        <option value="">不指定</option>{batch.orders.map(o => <option key={o.id} value={o.id}>#{o.id} {o.buyer_name}</option>)}
      </select></Field>
    </div>
    <Field label="标题"><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder={TICKET_TYPE[f.type]} /></Field>
    <Field label="情况描述（可附照片编号、称重数据）"><textarea required value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
  </FormShell>
}

function InsuranceForm({ batch, onDone }) {
  const [f, setF] = useState({ policy_no: '', amount: '', note: '' })
  return <FormShell path={`/batches/${batch.id}/insurance`}
    body={{ ...f, amount: Number(f.amount), evidence: [] }} onDone={onDone} label="提交报案">
    <Field label="保单号"><input required value={f.policy_no} onChange={e => setF({ ...f, policy_no: e.target.value })} /></Field>
    <Field label="预估理赔金额(元)"><input type="number" step="0.01" required value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
    <Field label="说明"><textarea value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field>
  </FormShell>
}
