import React from 'react'
import { Routes, Route, NavLink, useNavigate, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { ToastProvider } from './components/ui'
import { ROLE_LABEL } from './api'
import Login from './pages/Login'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import MyAdoptions from './pages/MyAdoptions'
import Incidents from './pages/Incidents'
import FarmConsole from './pages/FarmConsole'
import PlotLedger from './pages/PlotLedger'
import PlatformAdmin from './pages/PlatformAdmin'
import Services from './pages/Services'

function TopBar() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const farmerish = user && ['farmer', 'picker', 'packer', 'logistics'].includes(user.role)
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <NavLink to="/" className="brand">
          🌱 谷香认养
        </NavLink>
        <nav className="nav">
          <NavLink to="/" end>认养项目</NavLink>
          <NavLink to="/services">直播 · 公益 · 团购</NavLink>
          {user && <NavLink to="/my">我的认养</NavLink>}
          {user && <NavLink to="/incidents">异常工单</NavLink>}
          {farmerish && <NavLink to="/farm">农场工作台</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin">平台总览</NavLink>}
        </nav>
        <div className="userbox">
          {user ? (
            <>
              <span>
                {user.name} · {ROLE_LABEL[user.role]}
              </span>
              <button
                className="sm"
                onClick={() => {
                  logout()
                  nav('/')
                }}
              >
                退出
              </button>
            </>
          ) : (
            <button className="sm" onClick={() => nav('/login')}>
              登录
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

function Shell() {
  const { user } = useAuth()
  return (
    <>
      <TopBar />
      <div className="container">
        <Routes>
          <Route path="/" element={<Projects />} />
          <Route path="/login" element={<Login />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/services" element={<Services />} />
          <Route path="/my" element={user ? <MyAdoptions /> : <Navigate to="/login" />} />
          <Route path="/incidents" element={user ? <Incidents /> : <Navigate to="/login" />} />
          <Route path="/farm" element={user ? <FarmConsole /> : <Navigate to="/login" />} />
          <Route path="/plots/:id/ledger" element={user ? <PlotLedger /> : <Navigate to="/login" />} />
          <Route path="/admin" element={user ? <PlatformAdmin /> : <Navigate to="/login" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </AuthProvider>
  )
}
