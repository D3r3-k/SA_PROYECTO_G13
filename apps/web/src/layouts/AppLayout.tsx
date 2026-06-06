import { Link, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import styles from './AppLayout.module.css'

interface Props {
  children: ReactNode
}

export default function AppLayout({ children }: Props) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={`container ${styles.headerInner}`}>
          <Link to="/catalog" className={styles.logo}>
            <span className={styles.logoQ}>Q</span>uetxal TV
          </Link>
          <nav className={styles.nav}>
            <Link to="/catalog" className={styles.navLink}>Catálogo</Link>
            <Link to="/subscriptions" className={styles.navLink}>Planes</Link>
            <Link to="/history" className={styles.navLink}>Historial</Link>
          </nav>
          <div className={styles.actions}>
            <Link to="/profiles" className="btn btn-ghost btn-sm">
              Perfiles
            </Link>
            <Link to="/account" className="btn btn-ghost btn-sm">
              Mi cuenta
            </Link>
            <button onClick={handleLogout} className="btn btn-primary btn-sm">
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        {children}
      </main>
    </div>
  )
}
