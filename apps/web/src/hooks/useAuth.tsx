import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { authService, type AuthUser } from '../services/auth.service'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const res = await authService.me()
      const rawUser = res.data.user
      setUser({
        ...rawUser,
        roles: rawUser.roles ?? [],
        permissions: rawUser.permissions ?? [],
        is_admin: Boolean(rawUser.is_admin || rawUser.roles?.includes('admin')),
      })
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const login = async (email: string, password: string) => {
    await authService.login({ email, password })
    await refresh()
  }

  const logout = async () => {
    await authService.logout().catch(() => undefined)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
