import { createContext, useContext, useState } from 'react'
import { clearSession, getToken, getUser, setSession, api } from './api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (getToken() ? getUser() : null))

  async function login(username, password) {
    const data = await api('/auth/login', { method: 'POST', body: { username, password } })
    setSession(data.token, data.user)
    setUser(data.user)
    return data.user
  }
  function logout() {
    clearSession()
    setUser(null)
  }
  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>
}

export function useAuth() { return useContext(AuthCtx) }

export const ROLE_LABEL = {
  farmer: '农场主', buyer: '认养人', picker: '采摘工',
  packer: '包装员', logistics: '物流', cs: '客服', admin: '管理员'
}
