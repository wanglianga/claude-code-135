import React, { useEffect, useState } from 'react'
import { get, post, fmtDate, fmtDay } from '../api'
import { Tag, Empty, useToast } from '../components/ui'
import { useAuth } from '../auth'

const LIVE_LABEL = { scheduled: '预告', live: '直播中', ended: '回放' }
const LIVE_CLS = { scheduled: 'blue', live: 'red', ended: 'gray' }
const GB_STATUS = { pending: '待确认', confirmed: '已确认', fulfilled: '已履约', canceled: '已取消' }

export default function Services() {
  const [tab, setTab] = useState('live')
  return (
    <>
      <h1>🎥 直播 · 地块参观 · 企业团购 · 公益认养</h1>
      <div className="tabs">
        <button className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}>农场直播</button>
        <button className={tab === 'visit' ? 'active' : ''} onClick={() => setTab('visit')}>地块参观</button>
        <button className={tab === 'group' ? 'active' : ''} onClick={() => setTab('group')}>企业团购</button>
        <button className={tab === 'charity' ? 'active' : ''} onClick={() => setTab('charity')}>公益认养</button>
      </div>
      {tab === 'live' && <Live />}
      {tab === 'visit' && <Visits />}
      {tab === 'group' && <GroupBuy />}
      {tab === 'charity' && <Charity />}
    </>
  )
}

function Live() {
  const [list, setList] = useState([])
  useEffect(() => { get('/live').then(setList) }, [])
  return (
    <div className="grid grid-3">
      {list.map((l) => (
        <div key={l.id} className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <Tag cls={LIVE_CLS[l.status]}>{LIVE_LABEL[l.status]}</Tag>
            <span className="small muted">{fmtDate(l.starts_at)}</span>
          </div>
          <h3 className="mt8">{l.title}</h3>
          <div className="small muted">{l.farm_name}{l.project_title ? ' · ' + l.project_title : ''}</div>
          {l.stream_url && l.status !== 'scheduled' && (
            <a className="btn sm mt8" href={l.stream_url} target="_blank" rel="noreferrer">
              {l.status === 'live' ? '进入直播间 ▶' : '观看回放 ▶'}
            </a>
          )}
          {l.status === 'scheduled' && <div className="small muted mt8">⏰ 开播提醒已开放，认养人可在开播时收到通知</div>}
        </div>
      ))}
      {list.length === 0 && <Empty />}
    </div>
  )
}

function Visits() {
  const { user } = useAuth()
  const toast = useToast()
  const [plots, setPlots] = useState([])
  const [mine, setMine] = useState([])
  const [f, setF] = useState({ plot_id: '', visit_date: '', visitors: 1, note: '' })
  const load = () => { get('/plots').then(setPlots); if (user) get('/visits').then(setMine).catch(() => {}) }
  useEffect(load, [user])

  const submit = async () => {
    if (!user) return toast('请先登录', true)
    if (!f.plot_id || !f.visit_date) return toast('请选择地块和日期', true)
    try {
      await post('/visits', { ...f, plot_id: Number(f.plot_id), visitors: Number(f.visitors) })
      toast('预约已提交，等待农场审核'); setF({ plot_id: '', visit_date: '', visitors: 1, note: '' }); load()
    } catch (e) { toast(e.message, true) }
  }

  return (
    <div className="grid grid-2">
      <div className="card">
        <div className="section-title">📅 预约地块参观</div>
        <label>选择地块</label>
        <select value={f.plot_id} onChange={(e) => setF({ ...f, plot_id: e.target.value })}>
          <option value="">请选择</option>
          {plots.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.crop} · {p.farm_name}）</option>)}
        </select>
        <div className="grid grid-2">
          <div><label>参观日期</label><input type="date" value={f.visit_date} onChange={(e) => setF({ ...f, visit_date: e.target.value })} /></div>
          <div><label>人数</label><input type="number" min="1" value={f.visitors} onChange={(e) => setF({ ...f, visitors: e.target.value })} /></div>
        </div>
        <label>备注（想体验的项目）</label>
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="采摘/摇蜜/割稻…" />
        <button className="mt16" onClick={submit}>提交预约</button>
      </div>
      <div className="card">
        <div className="section-title">🎫 我的预约</div>
        {!user ? <Empty text="登录后查看我的预约" /> : mine.length === 0 ? <Empty text="暂无预约" /> : (
          <table>
            <tbody>
              {mine.map((v) => (
                <tr key={v.id}><td>{v.plot_name}<br /><span className="small muted">{fmtDay(v.visit_date)} · {v.visitors} 人</span></td>
                  <td><Tag cls={v.status === 'approved' ? 'green' : v.status === 'finished' ? 'gray' : 'amber'}>
                    {v.status === 'pending' ? '待审核' : v.status === 'approved' ? '已通过' : v.status === 'finished' ? '已完成' : '已取消'}</Tag></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function GroupBuy() {
  const { user } = useAuth()
  const toast = useToast()
  const [projects, setProjects] = useState([])
  const [list, setList] = useState([])
  const [f, setF] = useState({ project_id: '', company_name: '', contact: '', phone: '', shares: 10, discount_pct: 0 })
  const load = () => { get('/projects').then(setProjects); get('/group-buys').then(setList) }
  useEffect(load, [])
  const submit = async () => {
    if (!user) return toast('请先登录后提交', true)
    if (!f.project_id || !f.company_name || !f.shares) return toast('请完整填写团购信息', true)
    try {
      await post('/group-buys', { ...f, project_id: Number(f.project_id), shares: Number(f.shares), discount_pct: Number(f.discount_pct) })
      toast('团购需求已提交，农场将尽快联系'); load()
    } catch (e) { toast(e.message, true) }
  }
  return (
    <div className="grid grid-2">
      <div className="card">
        <div className="section-title">🏢 企业团购询价</div>
        <p className="muted small">员工福利、客户礼赠、工会采购：支持自定义包装规格、统一配送、折扣协商与发票。</p>
        <label>认养项目</label>
        <select value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })}>
          <option value="">请选择</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}（{p.batch_no}）</option>)}
        </select>
        <div className="grid grid-2">
          <div><label>公司名称</label><input value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} /></div>
          <div><label>联系人</label><input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></div>
          <div><label>联系电话</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div><label>意向份额</label><input type="number" min="1" value={f.shares} onChange={(e) => setF({ ...f, shares: e.target.value })} /></div>
        </div>
        <label>期望折扣 %</label>
        <input type="number" min="0" max="50" value={f.discount_pct} onChange={(e) => setF({ ...f, discount_pct: e.target.value })} />
        <button className="mt16" onClick={submit}>提交团购需求</button>
      </div>
      <div className="card">
        <div className="section-title">📋 团购需求列表</div>
        <table>
          <thead><tr><th>公司</th><th>项目</th><th>份额</th><th>折扣</th><th>状态</th></tr></thead>
          <tbody>
            {list.map((g) => (
              <tr key={g.id}><td>{g.company_name}<br /><span className="small muted">{g.contact} {g.phone}</span></td>
                <td className="small">{g.project_title}</td><td>{g.shares}</td><td>{g.discount_pct}%</td>
                <td><Tag cls={g.status === 'fulfilled' ? 'green' : g.status === 'confirmed' ? 'blue' : 'amber'}>{GB_STATUS[g.status]}</Tag></td></tr>
            ))}
            {list.length === 0 && <tr><td colSpan="5"><Empty /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Charity() {
  const [list, setList] = useState([])
  useEffect(() => { get('/charity').then(setList) }, [])
  const total = list.reduce((a, x) => a + Number(x.shares || 0), 0)
  return (
    <>
      <div className="card" style={{ background: 'linear-gradient(120deg,#fff1f2,#fff8e1)' }}>
        <h1>❤️ 公益认养 · 把丰收送给需要的人</h1>
        <p className="muted">认养人可在认养稻田等项目时选择公益代捐，农场将农产品直送敬老院、希望小学等受益方。累计代捐 <strong>{total}</strong> 份。</p>
      </div>
      <div className="grid grid-3">
        {list.map((c) => (
          <div key={c.id} className="card">
            <Tag cls="red">❤️ 公益代捐</Tag>
            <h3 className="mt8">{c.donee}</h3>
            <div className="small muted">捐赠人：{c.donor_name} · {c.shares} 份 · {c.project_title}</div>
            {c.message && <div className="small mt8">“{c.message}”</div>}
            <div className="tl-time">{fmtDate(c.created_at)}</div>
          </div>
        ))}
        {list.length === 0 && <Empty />}
      </div>
    </>
  )
}
