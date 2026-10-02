import { Link } from 'react-router-dom'
import { useState } from 'react'
import { api } from '../api'
import { useApi, Spinner, ErrorBox, Badge, BATCH_STATUS, fmtDay, Modal, Field } from '../components'

const ITEM_LABEL = {
  input: '种苗/设施投入', fertilizer: '肥料', pesticide: '农药', labor: '人工',
  packaging: '包装', logistics: '物流', disaster_loss: '灾害损失', other: '其他'
}

export default function FarmConsole() {
  const [tab, setTab] = useState('batches')
  return <>
    <h1>农场控制台</h1>
    <div className="tabs">
      <button className={tab === 'batches' ? 'active' : ''} onClick={() => setTab('batches')}>📋 认养批次管理</button>
      <button className={tab === 'ledger' ? 'active' : ''} onClick={() => setTab('ledger')}>📒 地块完整账（投入→回访）</button>
    </div>
    {tab === 'batches' && <BatchList />}
    {tab === 'ledger' && <Ledger />}
  </>
}

function BatchList() {
  const { data, error, loading } = useApi('/farm/batches')
  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  return <div className="card">
    <div className="table-wrap"><table>
      <thead><tr><th>批次号</th><th>项目</th><th>状态</th><th>已售/总份额</th><th>预计成熟</th><th>订单</th><th>未关闭工单</th><th></th></tr></thead>
      <tbody>{data.map(b => (
        <tr key={b.id}>
          <td><strong>{b.code}</strong>{b.note && <div className="small muted">{b.note}</div>}</td>
          <td>{b.project_name}</td>
          <td><Badge map={BATCH_STATUS} value={b.status} /></td>
          <td>{b.shares_sold}/{b.shares_total}</td>
          <td>{fmtDay(b.est_mature_date)}</td>
          <td>{b.order_count}</td>
          <td>{b.open_tickets > 0
            ? <span className="badge b-red">{b.open_tickets} 待处理</span>
            : <span className="badge b-green">0</span>}</td>
          <td><Link to={`/batches/${b.id}`}><button className="btn-sm btn-ghost">进入批次作业</button></Link></td>
        </tr>
      ))}</tbody>
    </table></div>
  </div>
}

function Ledger() {
  const { data, error, loading, reload } = useApi('/farm/ledger')
  const [openPlot, setOpenPlot] = useState(null)
  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  return <>
    <div className="card">
      <h2>📒 按地块查看完整账</h2>
      <p className="small muted">从农事投入、灾害损失、成熟抽检、采摘过磅、分拣装箱、冷链发货到售后赔付与回访满意度，按地块/批次逐笔沉淀；项目结束后即形成地块成本与客户满意度资产。</p>
    </div>
    <div className="grid grid-2">
      {data.map(p => {
        const s = p.flow_summary || {}
        return (
          <div key={p.id} className="card">
            <div className="flex-between">
              <h3>{p.code} {p.name} <span className="small muted">{p.area_mu} 亩 · {p.crop_type}</span></h3>
              <strong style={{ color: 'var(--earth)' }}>成本 ¥{Number(p.cost_total).toFixed(0)}</strong>
            </div>
            <div className="grid grid-4 mt8" style={{ gap: 8 }}>
              <Mini label="累计采摘(kg)" value={s.picked_kg} />
              <Mini label="累计发货(kg)" value={s.shipped_kg} />
              <Mini label="赔付(元)" value={s.compensation_amount} danger />
              <Mini label="回访均分" value={s.satisfaction_avg ? Number(s.satisfaction_avg).toFixed(2) : '—'} />
            </div>
            <div className="mt8">
              {p.cost_by_item?.map(c => (
                <span key={c.item} className="badge b-gray" style={{ marginRight: 6 }}>
                  {ITEM_LABEL[c.item] || c.item} ¥{Number(c.amount).toFixed(0)}
                </span>
              ))}
            </div>
            <div className="table-wrap mt8"><table>
              <thead><tr><th>批次</th><th>状态</th><th>采摘(kg)</th><th>成本</th><th>认养收入</th></tr></thead>
              <tbody>{p.batches.map(b => (
                <tr key={b.id}>
                  <td><Link to={`/batches/${b.id}`}>{b.code}</Link></td>
                  <td><Badge map={BATCH_STATUS} value={b.status} /></td>
                  <td>{b.picked_kg}</td><td>¥{Number(b.batch_cost).toFixed(0)}</td>
                  <td>¥{Number(b.batch_income).toFixed(0)}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <button className="btn-sm btn-ghost mt8" onClick={() => setOpenPlot(p.id)}>＋ 登记地块成本</button>
            {openPlot === p.id && <CostForm plot={p} onClose={() => setOpenPlot(null)} onDone={() => { setOpenPlot(null); reload() }} />}
          </div>
        )
      })}
    </div>
  </>
}

function Mini({ label, value, danger }) {
  return <div style={{ background: '#fafbfa', borderRadius: 8, padding: '8px 10px' }}>
    <strong style={{ color: danger ? 'var(--red)' : 'var(--green-dark)', fontSize: 16 }}>{value ?? 0}</strong>
    <div className="small muted">{label}</div>
  </div>
}

function CostForm({ plot, onClose, onDone }) {
  const [f, setF] = useState({
    batch_id: plot.batches[0]?.id || '', item: 'input', amount: '', occurred_at: '', note: ''
  })
  const [err, setErr] = useState(null)
  async function submit(e) {
    e.preventDefault(); setErr(null)
    try {
      await api(`/plots/${plot.id}/costs`, {
        method: 'POST',
        body: { ...f, batch_id: Number(f.batch_id) || 0, amount: Number(f.amount) }
      })
      onDone()
    } catch (e2) { setErr(e2.message) }
  }
  return <form onSubmit={submit} className="mt16" style={{ background: '#fafbfa', padding: 14, borderRadius: 8 }}>
    <div className="form-row">
      <Field label="归集批次"><select value={f.batch_id} onChange={e => setF({ ...f, batch_id: e.target.value })}>
        <option value="">不指定</option>{plot.batches.map(b => <option key={b.id} value={b.id}>{b.code}</option>)}
      </select></Field>
      <Field label="成本科目"><select value={f.item} onChange={e => setF({ ...f, item: e.target.value })}>
        {Object.entries(ITEM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select></Field>
      <Field label="金额(元)"><input type="number" step="0.01" required value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
      <Field label="发生日期"><input type="date" value={f.occurred_at} onChange={e => setF({ ...f, occurred_at: e.target.value })} /></Field>
    </div>
    <Field label="备注"><input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field>
    {err && <div className="alert alert-red mt8">{err}</div>}
    <div className="mt8 flex"><button className="btn-sm">保存</button>
      <button type="button" className="btn-sm btn-ghost" onClick={onClose}>取消</button></div>
  </form>
}
