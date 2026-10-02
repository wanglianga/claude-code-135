import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import Layout from './pages/Layout'
import Login from './pages/Login'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import BatchDetail from './pages/BatchDetail'
import MyAdoptions from './pages/MyAdoptions'
import FarmConsole from './pages/FarmConsole'
import Workbench from './pages/Workbench'
import Tickets from './pages/Tickets'
import './styles.css'

function RequireAuth({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route path="/" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/batches/:id" element={<BatchDetail />} />
            <Route path="/my" element={<MyAdoptions />} />
            <Route path="/farm" element={<FarmConsole />} />
            <Route path="/workbench" element={<Workbench />} />
            <Route path="/tickets" element={<Tickets />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
