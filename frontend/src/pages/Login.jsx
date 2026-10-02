import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, ROLE_LABEL } from '../auth'

const DEMO = [
  { username: 'farmer1', role: 'farmer', name: '老王 · 农场主' },
  { username: 'buyer1', role: 'buyer', name: '张小明 · 认养人' },
  { username: 'buyer2', role: 'buyer', name: '李华 · 企业采购' },
  { username: 'picker1', role: 'picker', name: '赵大山 · 采摘工' },
  { username: 'packer1', role: 'packer', name: '钱晓梅 · 包装员' },
  { username: 'logistics1', role: 'logistics', name: '孙速达 · 冷链物流' },
  { username: 'cs1', role: 'cs', name: '周小暖 · 客服' },
  { username: 'admin1', role: 'admin', name: '平台管理员' }
]

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [username, setUsername] = useState('buyer1')
  const [password, setPassword] = useState('farm123456')
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(null); setLoading(true)
    try {
      await login(username.trim(), password)
      nav('/')
    } catch (e2) { setErr(e2.message) } finally { setLoading(false) }
  }

  return (
    <div className="container login-wrap">
      <div className="hero">
        <div className="emoji">🍎🚜</div>
        <h1>云耕认养平台</h1>
        <div className="muted">农产品众筹认养 · 成熟度回访 · 全链路批次追溯</div>
      </div>
      <div className="card">
        <form onSubmit={submit}>
          <label>账号</label>
          <input value={username} onChange={e => setUsername(e.target.value)} autoFocus />
          <label>密码</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          {err && <div className="alert alert-red mt16">{err}</div>}
          <button style={{ width: '100%', marginTop: 16 }} disabled={loading}>
            {loading ? '登录中…' : '登 录'}
          </button>
        </form>
        <div className="divider" />
        <div className="small muted">演示账号（密码统一为 farm123456），点击快速填充：</div>
        <div className="role-grid">
          {DEMO.map(d => (
            <button key={d.username} type="button"
              className={`role-btn ${username === d.username ? 'active' : ''}`}
              onClick={() => setUsername(d.username)}>
              {d.name} <span className="tag-role">{ROLE_LABEL[d.role]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="footer-note">
        平台把农场、认养人、采摘工、包装员、物流、客服的处理结果串联到同一认养批次，
        覆盖农事投入 → 灾害 → 成熟 → 采摘 → 分拣 → 发货 → 赔付 → 回访全流程。
      </div>
    </div>
  )
}
