import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth, ROLE_LABEL } from '../auth'

export default function Layout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const r = user?.role

  const links = [
    { to: '/', label: '认养项目', show: true },
    { to: '/my', label: '我的认养', show: r === 'buyer' },
    { to: '/farm', label: '农场控制台', show: r === 'farmer' || r === 'admin' },
    { to: '/workbench', label: '工作台', show: ['picker', 'packer', 'logistics', 'cs'].includes(r) },
    { to: '/tickets', label: '工单中心', show: true }
  ].filter(x => x.show)

  return (
    <div className="layout">
      <header className="topbar">
        <NavLink to="/" className="logo">🍎 云耕认养</NavLink>
        <nav>
          {links.map(l => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'}
              className={({ isActive }) => isActive ? 'active' : ''}>{l.label}</NavLink>
          ))}
        </nav>
        <div className="spacer" />
        <div className="user-chip">
          {user?.name}
          <span className="tag-role" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}>
            {ROLE_LABEL[r]}
          </span>
          <button className="btn-sm btn-ghost" style={{ borderColor: 'rgba(255,255,255,.6)', color: '#fff' }}
            onClick={() => { logout(); nav('/login') }}>退出</button>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  )
}
