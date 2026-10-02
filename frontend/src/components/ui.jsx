import React, { createContext, useCallback, useContext, useState } from 'react'
import { KIND_LABEL, KIND_EMOJI } from '../api'

const ToastCtx = createContext(null)
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const show = useCallback((msg, isErr) => {
    setToast({ msg, isErr })
    setTimeout(() => setToast(null), 2800)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div className={'toast' + (toast.isErr ? ' err' : '')}>{toast.msg}</div>}
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

export function Tag({ children, cls = '' }) {
  return <span className={'tag ' + cls}>{children}</span>
}

export function StatusTag({ status, map, cls = 'green' }) {
  return <Tag cls={cls}>{map[status] || status}</Tag>
}

export function Stat({ label, value, cls = '' }) {
  return (
    <div className={'stat ' + cls}>
      <div className="n">{value}</div>
      <div className="l">{label}</div>
    </div>
  )
}

export function Progress({ sold, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((sold / total) * 100)) : 0
  return (
    <div>
      <div className="progress">
        <i style={{ width: pct + '%' }} />
      </div>
      <div className="small muted">
        已认养 {sold}/{total} 份 · {pct}%
      </div>
    </div>
  )
}

export function KindTag({ kind }) {
  return (
    <Tag cls="teal">
      {KIND_EMOJI[kind]} {KIND_LABEL[kind]}
    </Tag>
  )
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px',
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: wide ? 760 : 480, margin: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="ghost sm" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="mt16">{children}</div>
      </div>
    </div>
  )
}

export function Empty({ text = '暂无数据' }) {
  return <div className="empty">{text}</div>
}

export function ShipFlow({ status }) {
  const flow = ['planned', 'picked', 'packed', 'shipped', 'delivered']
  const labels = { planned: '排产', picked: '采摘', packed: '包装', shipped: '发货', delivered: '送达' }
  const idx = flow.indexOf(status)
  return (
    <span className="pill-flow">
      {flow.map((s, i) => (
        <span key={s} className={i < idx ? 'done' : i === idx ? 'cur' : ''}>
          {labels[s]}
        </span>
      ))}
    </span>
  )
}
