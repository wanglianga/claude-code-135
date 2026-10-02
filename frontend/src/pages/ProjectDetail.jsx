import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { useApi, Spinner, ErrorBox, CATEGORY, Badge, BATCH_STATUS, fmtDay, Modal, Field } from '../components'

export default function ProjectDetail() {
  const { id } = useParams()
  const { data: p, error, loading, reload } = useApi(`/projects/${id}`, [id])
  const { user } = useAuth()
  const [adoptBatch, setAdoptBatch] = useState(null)
  const [createBatch, setCreateBatch] = useState(false)

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  const cat = CATEGORY[p.category] || { label: p.category, emoji: '🌱' }

  return (
    <>
      <Link to="/" className="small">← 返回项目市场</Link>
      <div className="card mt16">
        <div className="flex" style={{ alignItems: 'flex-start' }}>
          <div className="proj-cover" style={{ width: 130, height: 100, background: cat.bg, flexShrink: 0 }}>{cat.emoji}</div>
          <div style={{ flex: 1 }}>
            <div className="flex-between">
              <h1 style={{ marginBottom: 4 }}>{p.name}</h1>
              <span className="badge b-earth">{cat.label}</span>
            </div>
            <div className="muted small">{p.farm_name} · {p.farm_location} · 地块 {p.plot_code} {p.plot_name}（{p.area_mu} 亩）</div>
            <div className="flex mt8">
              <strong style={{ color: 'var(--red)', fontSize: 22 }}>¥{Number(p.price_per_share).toFixed(0)}</strong>
              <span className="muted">/份 · 每份应得 {p.unit_per_share} {p.unit} · 预计成熟 {fmtDay(p.est_mature_date)}</span>
            </div>
          </div>
        </div>
        <div className="divider" />
        <dl className="kv">
          <dt>采摘标准</dt><dd>{p.harvest_standard || '—'}</dd>
          <dt>配送范围</dt><dd>{p.delivery_range || '—'}</dd>
          <dt>认养人权益</dt><dd style={{ color: 'var(--green-dark)' }}>{p.rights_text || '—'}</dd>
        </dl>
      </div>

      <div className="card">
        <div className="flex-between">
          <h2>认养批次</h2>
          {user.role === 'farmer' && <button className="btn-sm" onClick={() => setCreateBatch(true)}>＋ 新建批次</button>}
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>批次号</th><th>状态</th><th>份额（已售/总）</th><th>预计成熟</th><th>订单数</th><th>操作</th></tr></thead>
            <tbody>
              {p.batches.map(b => (
                <tr key={b.id}>
                  <td><strong>{b.code}</strong>{b.note && <div className="small muted">{b.note}</div>}</td>
                  <td><Badge map={BATCH_STATUS} value={b.status} /></td>
                  <td>{b.shares_sold} / {b.shares_total}</td>
                  <td>{fmtDay(b.est_mature_date)}</td>
                  <td>{b.order_count}</td>
                  <td className="flex">
                    <Link to={`/batches/${b.id}`}><button className="btn-sm btn-ghost">批次全景</button></Link>
                    {user.role === 'buyer' && b.shares_sold < b.shares_total && b.status === 'growing' &&
                      <button className="btn-sm" onClick={() => setAdoptBatch(b)}>立即认养</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {adoptBatch && <AdoptModal batch={adoptBatch} project={p} onClose={() => setAdoptBatch(null)}
        onDone={() => { setAdoptBatch(null); reload(); alert('认养成功！认养证书已生成，可在「我的认养」查看') }} />}
      {createBatch && <CreateBatch project={p} onClose={() => setCreateBatch(false)}
        onDone={() => { setCreateBatch(false); reload() }} />}
    </>
  )
}

function AdoptModal({ batch, project, onClose, onDone }) {
  const [shares, setShares] = useState(1)
  const [err, setErr] = useState(null)
  const remain = batch.shares_total - batch.shares_sold
  async function submit() {
    setErr(null)
    try {
      await api('/orders', { method: 'POST', body: { batch_id: batch.id, shares: Number(shares) } })
      onDone()
    } catch (e) { setErr(e.message) }
  }
  return <Modal title={`认养 ${batch.code}`} onClose={onClose}>
    <p className="small muted">付款后可查看农事日志、成熟度抽检、预估产量与分批发货计划；收获后可提交成熟度回访。</p>
    <div className="form-row">
      <Field label={`认养份数（剩余 ${remain} 份）`}>
        <input type="number" min="1" max={remain} value={shares} onChange={e => setShares(e.target.value)} />
      </Field>
      <Field label="应付金额（元）"><input disabled value={(Number(project.price_per_share) * Number(shares || 0)).toFixed(2)} /></Field>
    </div>
    <Field label="预期应得"><input disabled value={`${Number(project.unit_per_share) * Number(shares || 0)} ${project.unit}`} /></Field>
    {err && <div className="alert alert-red mt16">{err}</div>}
    <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>取消</button><button onClick={submit}>确认付款</button></div>
  </Modal>
}

function CreateBatch({ project, onClose, onDone }) {
  const [f, setF] = useState({ shares_total: project.total_shares, est_mature_date: '', note: '' })
  const [err, setErr] = useState(null)
  async function submit(e) {
    e.preventDefault(); setErr(null)
    try {
      await api(`/projects/${project.id}/batches`, { method: 'POST', body: { ...f, shares_total: Number(f.shares_total) } })
      onDone()
    } catch (e2) { setErr(e2.message) }
  }
  return <Modal title="新建认养批次" onClose={onClose}>
    <form onSubmit={submit}>
      <div className="form-row">
        <Field label="批次总份额"><input type="number" min="1" value={f.shares_total} onChange={e => setF({ ...f, shares_total: e.target.value })} /></Field>
        <Field label="预计成熟日期"><input type="date" value={f.est_mature_date} onChange={e => setF({ ...f, est_mature_date: e.target.value })} /></Field>
      </div>
      <Field label="备注"><input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field>
      {err && <div className="alert alert-red mt16">{err}</div>}
      <div className="modal-foot"><button type="button" className="btn-ghost" onClick={onClose}>取消</button><button>创建</button></div>
    </form>
  </Modal>
}
