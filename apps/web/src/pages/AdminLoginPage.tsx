import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { authService } from '../services/auth.service'
import AuthLayout from '../layouts/AuthLayout'
import styles from './AuthPage.module.css'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const { login, logout, refresh } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email, password)
      await refresh()
      const me = await authService.me()
      const user = me.data.user
      const isAdmin = Boolean(user.is_admin || user.roles?.includes('admin'))

      if (!isAdmin) {
        await logout()
        setError('Tu usuario no tiene rol de administrador.')
        return
      }

      navigate('/admin', { replace: true })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Credenciales inválidas o servicio no disponible.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className={styles.title}>Panel Administrativo</h1>
      <p className={styles.subtitle}>Ingresa con una cuenta que tenga rol de administrador.</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className="input-group">
          <label className="input-label" htmlFor="email">Correo electrónico</label>
          <input
            id="email"
            type="email"
            className="input"
            placeholder="admin@quetxal.tv"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            className="input"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className={styles.errorMsg}>{error}</p>}

        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
          {loading ? <span className="spinner" /> : 'Ingresar como administrador'}
        </button>
      </form>
    </AuthLayout>
  )
}
