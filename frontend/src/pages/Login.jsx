import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { useToast } from '../components/ui'

const DEMO = [
  { phone: '13900000002', name: '陈曦 · 认养人', desc: '查看权益兑现/分批发货/回访' },
  { phone: '13900000001', name: '李远山 · 农场主', desc: '发布项目/农事/采摘/台账' },
  { phone: '13900000003', name: '赵秀兰 · 采摘工', desc: '回填采摘产量与坏果率' },
  { phone: '13900000004', name: '王梅 · 包装员', desc: '登记分拣与包装规格' },
  { phone: '13900000005', name: '马建国 · 物流', desc: '推进冷链发货状态' },
  { phone: '13900000006', name: '孙悦 · 客服', desc: '工单协调/赔付/回访' },
  { phone: '13800000000', name: '平台管理员', desc: '平台总览/数据沉淀' },
]

export default function Login() {
  const { login } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('farm123')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const u = await login(phone, password)
      toast('欢迎回来，' + u.name)
      if (u.role === 'admin') nav('/admin')
      else if (['farmer', 'picker', 'packer', 'logistics'].includes(u.role)) nav('/farm')
      else nav('/my')
    } catch (e) {
      toast(e.message, true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>🌾 谷香认养平台</h1>
        <p className="muted">从一棵树、一垄田到餐桌，全程透明的农产品众筹认养</p>
        <form onSubmit={submit}>
          <label>手机号</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="请输入手机号" />
          <label>密码</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button style={{ width: '100%', marginTop: 16 }} disabled={busy}>
            {busy ? '登录中…' : '登录'}
          </button>
        </form>
        <div className="demo-accounts">
          <h3>演示账号（密码均为 farm123，点击自动填充）</h3>
          {DEMO.map((d) => (
            <div key={d.phone} className="acc" onClick={() => setPhone(d.phone)}>
              <span>{d.name}</span>
              <span className="muted">{d.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
