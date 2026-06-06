import { useState, type FormEvent } from 'react'
import AppLayout from '../layouts/AppLayout'
import { useAuth } from '../hooks/useAuth'
import { authService } from '../services/auth.service'
import styles from './AccountPage.module.css'

export default function AccountPage() {
  const { user } = useAuth()
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleUpdatePassword = async (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (newPwd !== confirmPwd) {
      setMessage({ type: 'error', text: 'Las contraseñas nuevas no coinciden.' })
      return
    }
    if (newPwd.length < 8) {
      setMessage({ type: 'error', text: 'La nueva contraseña debe tener al menos 8 caracteres.' })
      return
    }

    setLoading(true)
    try {
      await authService.updateCredentials({
        current_password: currentPwd,
        new_password: newPwd,
      })
      setMessage({ type: 'success', text: 'Contraseña actualizada. Inicia sesión de nuevo.' })
      setCurrentPwd('')
      setNewPwd('')
      setConfirmPwd('')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'No se pudo actualizar la contraseña.'
      setMessage({ type: 'error', text: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppLayout>
      <div className="container section">
        <h1 className={styles.title}>Mi cuenta</h1>

        <div className={styles.grid}>
          <div className="card">
            <h2 className={styles.sectionTitle}>Información de la cuenta</h2>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Correo electrónico</span>
              <span className={styles.infoValue}>{user?.email}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>ID de usuario</span>
              <span className={`${styles.infoValue} ${styles.mono}`}>{user?.user_id}</span>
            </div>
          </div>

          <div className="card">
            <h2 className={styles.sectionTitle}>Cambiar contraseña</h2>
            <form onSubmit={handleUpdatePassword} className={styles.form}>
              <div className="input-group">
                <label className="input-label" htmlFor="currentPwd">Contraseña actual</label>
                <input
                  id="currentPwd"
                  type="password"
                  className="input"
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="newPwd">Nueva contraseña</label>
                <input
                  id="newPwd"
                  type="password"
                  className="input"
                  placeholder="Mínimo 8 caracteres"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  minLength={8}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="confirmPwd">Confirmar contraseña</label>
                <input
                  id="confirmPwd"
                  type="password"
                  className="input"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  required
                />
              </div>

              {message && (
                <div className={`${styles.msg} ${styles[message.type]}`}>
                  {message.text}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? <span className="spinner" /> : 'Actualizar contraseña'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
