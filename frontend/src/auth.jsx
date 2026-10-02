import React, { createContext, useContext, useEffect, useState } from 'react'
import { getToken, setToken, get } from './api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = getToken()
    if (!t) {
      setLoading(false)
      return
    }
    get('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (phone, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '登录失败')
    setToken(data.token)
    setUser(data.user)
    return data.user
  }
  const logout = () => {
    setToken(null)
    setUser(null)
  }

  if (loading) return null
  return <AuthCtx.Provider value={{ user, login, logout, setUser }}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
