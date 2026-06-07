import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import AuthLayout from '../layouts/AuthLayout'
import styles from './AuthPage.module.css'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

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
      navigate('/profiles')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Credenciales inválidas'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className={styles.title}>Iniciar sesión</h1>
      <p className={styles.subtitle}>Bienvenido de vuelta a Quetxal TV</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className="input-group">
          <label className="input-label" htmlFor="email">Correo electrónico</label>
          <input
            id="email"
            type="email"
            className="input"
            placeholder="tu@correo.com"
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
            placeholder="Mínimo 8 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className={styles.errorMsg}>{error}</p>}

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={loading}
        >
          {loading ? <span className="spinner" /> : 'Entrar'}
        </button>
      </form>

      <p className={styles.switchLink}>
        ¿No tienes cuenta?{' '}
        <Link to="/register" className="text-primary">Regístrate</Link>
      </p>
    </AuthLayout>
  )
}
