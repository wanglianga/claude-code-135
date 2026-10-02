import { useEffect, useState } from 'react'
import { api } from './api'

export function useApi(path, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const reload = () => {
    setLoading(true)
    api(path).then(d => { setData(d); setError(null) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(reload, deps) // eslint-disable-line
  return { data, error, loading, reload, setData }
}

export function Spinner({ label = '加载中…' }) {
  return <div className="muted" style={{ padding: '30px 0', textAlign: 'center' }}>🌱 {label}</div>
}

export function ErrorBox({ error }) {
  return error ? <div className="alert alert-red">{error}</div> : null
}

export const CATEGORY = {
  apple: { label: '苹果', emoji: '🍎', bg: 'linear-gradient(135deg,#ffe0e0,#ffcdd2)' },
  blueberry: { label: '蓝莓', emoji: '🫐', bg: 'linear-gradient(135deg,#e8eaf6,#c5cae9)' },
  honey: { label: '蜂蜜', emoji: '🍯', bg: 'linear-gradient(135deg,#fff8e1,#ffe082)' },
  rice: { label: '稻田', emoji: '🌾', bg: 'linear-gradient(135deg,#f1f8e9,#dcedc8)' },
  vegetable: { label: '有机蔬菜', emoji: '🥬', bg: 'linear-gradient(135deg,#e8f5e9,#a5d6a7)' }
}

export const BATCH_STATUS = {
  growing: ['生长中', 'b-green'], mature: ['已成熟', 'b-green'], harvesting: ['采摘中', 'b-amber'],
  delivering: ['配送中', 'b-blue'], disputed: ['争议处理中', 'b-red'], completed: ['已完结', 'b-gray']
}
export const ORDER_STATUS = {
  paid: ['已付款', 'b-amber'], partial_shipped: ['部分发货', 'b-blue'],
  shipped: ['已发货', 'b-blue'], completed: ['已完成', 'b-green'], refunded: ['已退款', 'b-gray']
}
export const TICKET_STATUS = {
  open: ['待处理', 'b-red'], processing: ['处理中', 'b-amber'], resolved: ['已解决', 'b-green'], closed: ['已关闭', 'b-gray']
}
export const TICKET_TYPE = {
  hail_loss: '冰雹减产', mature_delay: '成熟延后', address_change: '临时改地址',
  fruit_size: '果品大小不均', bad_fruit: '坏果投诉', dispatch_dispute: '分批配送争议',
  rights_mismatch: '权益与产量不一致'
}
export const SHIP_STATUS = {
  planned: ['待发出', 'b-gray'], in_transit: ['运输中', 'b-blue'], delivered: ['已签收', 'b-green'], exception: ['异常', 'b-red']
}
export const COMP_STATUS = {
  pending: ['待审核', 'b-amber'], approved: ['已核准', 'b-blue'], paid: ['已赔付', 'b-green'], rejected: ['已驳回', 'b-gray']
}
export const INS_STATUS = {
  filed: ['已报案', 'b-amber'], surveying: ['查勘中', 'b-amber'], approved: ['已核定', 'b-blue'],
  rejected: ['拒赔', 'b-red'], paid: ['已赔付', 'b-green']
}

export function Badge({ map, value }) {
  const m = map[value] || [value, 'b-gray']
  return <span className={`badge ${m[1]}`}>{m[0]}</span>
}

export function StatusPill({ value }) {
  const cls = { live: 'b-red', ended: 'b-gray', scheduled: 'b-blue' }[value] || 'b-gray'
  const txt = { live: <><span className="live-dot" /> 直播中</>, ended: '已结束', scheduled: '预告' }[value] || value
  return <span className={`badge ${cls}`}>{txt}</span>
}

export function fmtDate(v) {
  if (!v) return '—'
  return String(v).replace('T', ' ').slice(0, 16)
}
export function fmtDay(v) { return v ? String(v).slice(0, 10) : '—' }

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-mask" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={wide ? { maxWidth: 760 } : null}>
        <div className="flex-between">
          <h3>{title}</h3>
          <button className="btn-link" onClick={onClose}>✕ 关闭</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children }) {
  return <div><label>{label}</label>{children}</div>
}

export function SubmitBtn({ children, ...p }) {
  return <button {...p}>{children}</button>
}

export function Stars({ n }) {
  return n ? <span className="stars">{'★'.repeat(n)}<span style={{ color: '#e0e0e0' }}>{'★'.repeat(5 - n)}</span></span> : '—'
}

export function ProgressBar({ pct }) {
  return <div className="progress"><div style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>
}

export const TIMELINE_ICON = {
  farm_log: '🌱', disaster: '⛈️', inspection: '🔬', harvest: '🧺', sorting: '📦',
  shipment: '🚚', ticket: '🎫', compensation: '💰', insurance: '🛡️', revisit: '💬'
}

export const ROLE_LABEL = {
  farmer: '农场', buyer: '认养人', picker: '采摘工', packer: '包装员',
  logistics: '物流', cs: '客服', admin: '管理员'
}
