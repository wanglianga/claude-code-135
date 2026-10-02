import { Link } from 'react-router-dom'
import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import {
  useApi, Spinner, ErrorBox, CATEGORY, Badge, BATCH_STATUS, ProgressBar, StatusPill,
  fmtDay, Modal, Field
} from '../components'

export default function Projects() {
  const { data: stats } = useApi('/stats/overview')
  const { data: projects, error, loading, reload } = useApi('/projects')
  const { data: lives } = useApi('/live')
  const { data: visits } = useApi('/visits')
  const { data: groupbuys } = useApi('/group-buys')
  const { data: charity } = useApi('/charity')
  const [showCreate, setShowCreate] = useState(false)
  const { user } = useAuth()

  return (
    <>
      <div className="flex-between">
        <h1>认养项目市场</h1>
        {user.role === 'farmer' && <button onClick={() => setShowCreate(true)}>＋ 发布认养项目</button>}
      </div>

      {stats && (
        <div className="grid grid-4 mb-row">
          <div className="stat"><div className="num">{stats.projects}</div><div className="label">在架认养项目</div></div>
          <div className="stat"><div className="num">{stats.shares_sold}</div><div className="label">累计认养份额</div></div>
          <div className="stat"><div className="num">¥{Number(stats.gmv).toFixed(0)}</div><div className="label">认养金额（元）</div></div>
          <div className="stat"><div className="num">{Number(stats.satisfaction_avg).toFixed(2)}</div><div className="label">成熟度回访均分</div></div>
        </div>
      )}

      <ErrorBox error={error} />
      {loading ? <Spinner /> : (
        <div className="grid grid-3">
          {projects?.map(p => {
            const cat = CATEGORY[p.category] || { label: p.category, emoji: '🌱', bg: '#eee' }
            const soldPct = p.total_shares ? Number(p.shares_sold_all) / (p.total_shares * Math.max(1, p.batch_count)) * 100 : 0
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="card proj-card" style={{ color: 'inherit' }}>
                <div className="proj-cover" style={{ background: cat.bg }}>{cat.emoji}</div>
                <div className="flex-between">
                  <h3 style={{ margin: 0 }}>{p.name}</h3>
                  <span className="badge b-earth">{cat.label}</span>
                </div>
                <div className="small muted">{p.farm_name} · {p.plot_name || '—'}</div>
                <div className="flex" style={{ justifyContent: 'space-between' }}>
                  <strong style={{ color: 'var(--red)', fontSize: 17 }}>¥{Number(p.price_per_share).toFixed(0)}<span className="small muted">/份</span></strong>
                  <span className="small muted">每份 {p.unit_per_share} {p.unit}</span>
                </div>
                <div>
                  <div className="flex small muted" style={{ justifyContent: 'space-between' }}>
                    <span>累计认养 {p.shares_sold_all} 份 · {p.batch_count} 个批次</span>
                    <span>预计成熟 {fmtDay(p.est_mature_date)}</span>
                  </div>
                  <div className="progress mt8"><div style={{ width: `${Math.min(100, soldPct)}%` }} /></div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <div className="grid grid-2 mt16">
        <div className="card">
          <h2>📺 农场直播</h2>
          <table><tbody>
            {(lives || []).map(l => (
              <tr key={l.id}>
                <td><StatusPill value={l.status} /></td>
                <td>{l.title}<div className="small muted">{l.farm_name} · {fmtDay(String(l.started_at).slice(0, 10))}</div></td>
                {l.status === 'live' && <td><a href={l.url || '#'} target="_blank" rel="noreferrer"><button className="btn-sm btn-red">进入直播间</button></a></td>}
              </tr>
            ))}
          </tbody></table>
        </div>
        <div className="card">
          <h2>🏡 地块参观</h2>
          <table><tbody>
            {(visits || []).map(v => (
              <tr key={v.id}>
                <td><strong>{fmtDay(v.visit_date)}</strong><div className="small muted">{v.farm_name} · {v.plot_name}</div></td>
                <td>{v.note}</td>
                <td className="small">{v.booked_count}/{v.capacity} 人</td>
                <td>{v.capacity - v.booked_count > 0
                  ? <BookBtn visit={v} onDone={reload} />
                  : <span className="badge b-gray">已满</span>}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>🏢 企业团购</h2>
          <table><tbody>
            {(groupbuys || []).map(g => (
              <tr key={g.id}>
                <td>{g.company_name}<div className="small muted">{g.project_name} · {g.shares}份{g.discount_pct ? ` · 折扣${g.discount_pct}%` : ''}</div></td>
                <td><span className="badge b-amber">{ { pending: '待确认', confirmed: '已确认', rejected: '已婉拒', fulfilled: '已履约' }[g.status] }</span></td>
              </tr>
            ))}
          </tbody></table>
          {user.role === 'buyer' && <GroupBuyForm projects={projects || []} onDone={reload} />}
        </div>
        <div className="card">
          <h2>❤️ 公益认养</h2>
          <table><tbody>
            {(charity || []).map(c => (
              <tr key={c.id}>
                <td>{c.donor_name} 认养 {c.shares} 份<div className="small muted">{c.project_name} → 受益方：{c.beneficiary || '—'}</div></td>
                <td className="small muted">{c.message}</td>
              </tr>
            ))}
          </tbody></table>
          {['buyer', 'farmer'].includes(user.role) && <CharityForm projects={projects || []} onDone={reload} />}
        </div>
      </div>

      {showCreate && <CreateProject onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); reload() }} />}
    </>
  )
}

function BookBtn({ visit, onDone }) {
  async function book() {
    const people = prompt(`预约 ${fmtDay(visit.visit_date)}「${visit.plot_name}」，请输入人数：`, '2')
    if (!people) return
    await api(`/visits/${visit.id}/book`, { method: 'POST', body: { people: Number(people) } })
    alert('预约成功！农场将与您电话确认行程')
    onDone()
  }
  return <button className="btn-sm" onClick={book}>预约参观</button>
}

function GroupBuyForm({ projects, onDone }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ company_name: '', contact: '', phone: '', shares: 20, discount_pct: 0 })
  async function submit(e) {
    e.preventDefault()
    await api('/group-buys', { method: 'POST', body: { ...f, project_id: Number(f.project_id), shares: Number(f.shares) } })
    setOpen(false); onDone()
  }
  if (!open) return <button className="btn-ghost mt8" onClick={() => setOpen(true)}>企业团购询价</button>
  return <form onSubmit={submit} className="mt16">
    <div className="form-row">
      <Field label="认养项目"><select required onChange={e => setF({ ...f, project_id: e.target.value })}>
        <option value="">请选择</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></Field>
      <Field label="企业名称"><input required value={f.company_name} onChange={e => setF({ ...f, company_name: e.target.value })} /></Field>
    </div>
    <div className="form-row">
      <Field label="联系人"><input value={f.contact} onChange={e => setF({ ...f, contact: e.target.value })} /></Field>
      <Field label="电话"><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="份数"><input type="number" min="1" value={f.shares} onChange={e => setF({ ...f, shares: e.target.value })} /></Field>
    </div>
    <div className="mt8"><button>提交团购申请</button></div>
  </form>
}

function CharityForm({ projects, onDone }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ donor_name: '', shares: 1, beneficiary: '', message: '' })
  async function submit(e) {
    e.preventDefault()
    await api('/charity', { method: 'POST', body: { ...f, project_id: Number(f.project_id), shares: Number(f.shares) } })
    setOpen(false); onDone()
  }
  if (!open) return <button className="btn-ghost mt8" onClick={() => setOpen(true)}>发起公益认养</button>
  return <form onSubmit={submit} className="mt16">
    <div className="form-row">
      <Field label="认养项目"><select required onChange={e => setF({ ...f, project_id: e.target.value })}>
        <option value="">请选择</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></Field>
      <Field label="捐赠方"><input required value={f.donor_name} onChange={e => setF({ ...f, donor_name: e.target.value })} /></Field>
      <Field label="份数"><input type="number" min="1" value={f.shares} onChange={e => setF({ ...f, shares: e.target.value })} /></Field>
    </div>
    <div className="form-row">
      <Field label="受益方"><input value={f.beneficiary} onChange={e => setF({ ...f, beneficiary: e.target.value })} /></Field>
      <Field label="寄语"><input value={f.message} onChange={e => setF({ ...f, message: e.target.value })} /></Field>
    </div>
    <div className="mt8"><button>认捐</button></div>
  </form>
}

function CreateProject({ onClose, onDone }) {
  const [f, setF] = useState({
    name: '', category: 'apple', plot_id: '', total_shares: 100, price_per_share: '',
    unit_per_share: '', unit: '公斤', est_mature_date: '', harvest_standard: '',
    delivery_range: '全国顺丰冷链', rights_text: ''
  })
  const [err, setErr] = useState(null)
  async function submit(e) {
    e.preventDefault(); setErr(null)
    try {
      await api('/projects', {
        method: 'POST',
        body: { ...f, plot_id: Number(f.plot_id) || 0, total_shares: Number(f.total_shares),
          price_per_share: Number(f.price_per_share), unit_per_share: Number(f.unit_per_share) }
      })
      onDone()
    } catch (e2) { setErr(e2.message) }
  }
  return <Modal title="发布认养项目" onClose={onClose} wide>
    <form onSubmit={submit}>
      <div className="form-row">
        <Field label="项目名称"><input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="例：烟台红富士苹果树认养" /></Field>
        <Field label="品类"><select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>
          {Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select></Field>
      </div>
      <div className="form-row">
        <Field label="地块编号"><input type="number" value={f.plot_id} onChange={e => setF({ ...f, plot_id: e.target.value })} placeholder="1-5（演示数据）" /></Field>
        <Field label="总份额"><input type="number" value={f.total_shares} onChange={e => setF({ ...f, total_shares: e.target.value })} /></Field>
        <Field label="每份价格(元)"><input type="number" step="0.01" required value={f.price_per_share} onChange={e => setF({ ...f, price_per_share: e.target.value })} /></Field>
      </div>
      <div className="form-row">
        <Field label="每份应得数量"><input type="number" step="0.1" required value={f.unit_per_share} onChange={e => setF({ ...f, unit_per_share: e.target.value })} /></Field>
        <Field label="单位"><input value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} /></Field>
        <Field label="预计成熟日期"><input type="date" value={f.est_mature_date} onChange={e => setF({ ...f, est_mature_date: e.target.value })} /></Field>
      </div>
      <Field label="采摘标准"><textarea value={f.harvest_standard} onChange={e => setF({ ...f, harvest_standard: e.target.value })} placeholder="糖度/果径/品控要求…" /></Field>
      <Field label="配送范围"><input value={f.delivery_range} onChange={e => setF({ ...f, delivery_range: e.target.value })} /></Field>
      <Field label="认养人权益"><textarea required value={f.rights_text} onChange={e => setF({ ...f, rights_text: e.target.value })} placeholder="应得产量、证书、参观、赔付规则…" /></Field>
      {err && <div className="alert alert-red mt16">{err}</div>}
      <div className="modal-foot"><button type="button" className="btn-ghost" onClick={onClose}>取消</button><button>发布</button></div>
    </form>
  </Modal>
}
