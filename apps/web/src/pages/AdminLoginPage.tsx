import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../layouts/AuthLayout'
import styles from './AuthPage.module.css'

const ADMIN_USER = 'admin'
const ADMIN_PASS = 'Admin1234#'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      sessionStorage.setItem('adminAuthenticated', 'true')
      sessionStorage.setItem('adminKey', ADMIN_PASS)
      navigate('/admin', { replace: true })
    } else {
      setError('Credenciales incorrectas.')
    }
  }

  return (
    <AuthLayout>
      <h1 className={styles.title}>Panel Administrativo</h1>
      <p className={styles.subtitle}>Acceso restringido — solo personal autorizado</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className="input-group">
          <label className="input-label" htmlFor="username">Usuario</label>
          <input
            id="username"
            type="text"
            className="input"
            placeholder="admin"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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

        <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
          Ingresar
        </button>
      </form>
    </AuthLayout>
  )
}
