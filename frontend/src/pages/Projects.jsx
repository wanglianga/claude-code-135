import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, post, KIND_LABEL, KIND_EMOJI, fmtMoney, fmtDay } from '../api'
import { Progress, KindTag, Tag, Modal, useToast, Empty } from '../components/ui'
import { useAuth } from '../auth'

const STATUS = { ongoing: '认养中', harvesting: '采摘配送中', completed: '已结季' }
const STATUS_CLS = { ongoing: 'green', harvesting: 'amber', completed: 'gray' }

export default function Projects() {
  const [projects, setProjects] = useState([])
  const [kind, setKind] = useState('')
  const [adopt, setAdopt] = useState(null)
  const nav = useNavigate()
  const { user } = useAuth()

  const load = () => get('/projects' + (kind ? '?kind=' + kind : '')).then(setProjects)
  useEffect(() => { load() }, [kind])

  return (
    <>
      <div className="card" style={{ background: 'linear-gradient(120deg,#e8f5e9,#fff8e1)' }}>
        <h1>🍎🫐🍯🌾🥬 众筹认养一块好地</h1>
        <p className="muted" style={{ margin: 0 }}>
          农场直供：地块、批次、农事照片、施肥用药、天气灾害、成熟度抽检、分批发货与售后赔付全程可追溯。
          认养一份农产品，也是认养一整个透明的生长季。
        </p>
      </div>

      <div className="row mb8">
        <button className={kind === '' ? '' : 'ghost'} onClick={() => setKind('')}>全部</button>
        {Object.entries(KIND_LABEL).map(([k, v]) => (
          <button key={k} className={kind === k ? '' : 'ghost'} onClick={() => setKind(k)}>
            {KIND_EMOJI[k]} {v}
          </button>
        ))}
      </div>

      {projects.length === 0 ? <Empty /> : (
        <div className="grid grid-3">
          {projects.map((p) => (
            <div key={p.id} className="card proj-card" onClick={() => nav('/projects/' + p.id)}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <KindTag kind={p.kind} />
                <Tag cls={STATUS_CLS[p.status]}>{STATUS[p.status]}</Tag>
              </div>
              <div className="proj-emoji mt8">{KIND_EMOJI[p.kind]}</div>
              <div className="proj-title">{p.title}</div>
              <div className="small muted">
                {p.farm_name} · {p.plot_name} · 批次 {p.batch_no}
              </div>
              <div className="small muted mt8">
                预计成熟 {fmtDay(p.est_mature_date)} · 保底 {p.guarantee_kg} kg/{p.unit_name}
              </div>
              <div style={{ marginTop: 'auto' }}>
                <Progress sold={p.sold_shares} total={p.total_shares} />
                <div className="proj-meta">
                  <span className="price">{fmtMoney(p.price_per_share)}<span className="small muted">/{p.unit_name}</span></span>
                  <button
                    className="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!user) return nav('/login')
                      setAdopt(p)
                    }}
                  >
                    立即认养
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {adopt && <AdoptModal project={adopt} onClose={() => setAdopt(null)} onDone={() => { setAdopt(null); nav('/my') }} />}
    </>
  )
}

function AdoptModal({ project, onClose, onDone }) {
  const toast = useToast()
  const [shares, setShares] = useState(1)
  const [form, setForm] = useState({ recipient_name: '', phone: '', address: '' })
  const [charity, setCharity] = useState({ on: project.is_charity, donee: '', message: '' })
  const [busy, setBusy] = useState(false)
  const remain = project.total_shares - project.sold_shares
  const amount = (shares * project.price_per_share).toFixed(2)

  const submit = async () => {
    if (!form.recipient_name || !form.phone || !form.address) return toast('请填写完整收货信息', true)
    if (charity.on && !charity.donee) return toast('公益代捐请填写受益方', true)
    setBusy(true)
    try {
      const res = await post('/adoptions', {
        project_id: project.id,
        shares: Number(shares),
        ...form,
        is_charity: charity.on,
        donee: charity.donee,
        message: charity.message,
      })
      toast(`支付成功 ¥${res.paid_amount}，认养证书 ${res.cert_no} 已生成`)
      onDone()
    } catch (e) {
      toast(e.message, true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`认养 · ${project.title}`} onClose={onClose}>
      <dl className="kv">
        <dt>批次</dt><dd>{project.batch_no} · 剩余 {remain} {project.unit_name}</dd>
        <dt>认养权益</dt><dd className="small">{project.rights_text}</dd>
        <dt>采摘标准</dt><dd className="small">{project.harvest_standard}</dd>
        <dt>配送范围</dt><dd className="small">{project.delivery_range}</dd>
      </dl>
      <label>认养份额</label>
      <input type="number" min="1" max={remain} value={shares}
             onChange={(e) => setShares(Math.max(1, Math.min(remain, Number(e.target.value) || 1)))} />
      <div className="grid grid-3 mt8">
        <div><label>收货人</label><input value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} /></div>
        <div><label>手机号</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><label>收货地址</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
      </div>
      {project.is_charity && (
        <div className="mt16">
          <label><input type="checkbox" style={{ width: 'auto', marginRight: 6 }} checked={charity.on}
                        onChange={(e) => setCharity({ ...charity, on: e.target.checked })} />
            公益代捐（农产品直送受益方）
          </label>
          {charity.on && (
            <div className="grid grid-2">
              <input placeholder="受益方（如：西山敬老院）" value={charity.donee}
                     onChange={(e) => setCharity({ ...charity, donee: e.target.value })} />
              <input placeholder="寄语（选填）" value={charity.message}
                     onChange={(e) => setCharity({ ...charity, message: e.target.value })} />
            </div>
          )}
        </div>
      )}
      <div className="row mt16" style={{ justifyContent: 'space-between' }}>
        <strong className="price">合计 {fmtMoney(amount)}</strong>
        <span className="small muted">模拟支付，付款后立即生成认养证书</span>
        <button disabled={busy} onClick={submit}>{busy ? '支付中…' : '确认付款'}</button>
      </div>
    </Modal>
  )
}
