import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import adminApi from '../services/adminApi'
import { getPlanFeatures, setPlanFeatures } from '../utils/planFeatures'
import styles from './AdminPage.module.css'

const DEFAULT_FEATURES: Record<string, string[]> = {
  básico:   ['1 pantalla simultánea', 'Calidad HD', 'Sin descargas'],
  basic:    ['1 pantalla simultánea', 'Calidad HD', 'Sin descargas'],
  estándar: ['2 pantallas simultáneas', 'Calidad Full HD', 'Descargas limitadas'],
  standard: ['2 pantallas simultáneas', 'Calidad Full HD', 'Descargas limitadas'],
  premium:  ['4 pantallas simultáneas', 'Calidad 4K + HDR', 'Descargas ilimitadas'],
}

interface Plan {
  id: number
  name: string
  price_usd: number
  is_active: boolean
  features: string[]
}

interface EditForm {
  name: string
  price_usd: string
  features: string
}

interface SyncResult {
  success: boolean
  message: string
  contents_synced?: number
  episodes_synced?: number
}

export default function AdminPage() {
  const navigate = useNavigate()

  const [plans, setPlans] = useState<Plan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ name: '', price_usd: '', features: '' })
  const [saving, setSaving] = useState(false)
  const [planMsg, setPlanMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState('')

  useEffect(() => {
    if (sessionStorage.getItem('adminAuthenticated') !== 'true') {
      navigate('/login/admin', { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    fetchPlans()
  }, [])

  const fetchPlans = async () => {
    setLoadingPlans(true)
    try {
      const res = await adminApi.get<{ plans: Omit<Plan, 'features'>[] }>('/plans')
      setPlans(
        res.data.plans.map((p) => ({
          ...p,
          features: getPlanFeatures(p.id, DEFAULT_FEATURES[p.name.toLowerCase()] ?? []),
        }))
      )
    } catch {
      /* silencioso */
    } finally {
      setLoadingPlans(false)
    }
  }

  const startEdit = (plan: Plan) => {
    setEditingId(plan.id)
    setEditForm({
      name: plan.name,
      price_usd: String(plan.price_usd),
      features: plan.features.join('\n'),
    })
    setPlanMsg(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setPlanMsg(null)
  }

  const savePlan = async (planId: number) => {
    setSaving(true)
    setPlanMsg(null)
    try {
      await adminApi.patch(`/plans/${planId}`, {
        name: editForm.name.trim(),
        price_usd: parseFloat(editForm.price_usd),
      })
      const features = editForm.features
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean)
      setPlanFeatures(planId, features)
      setPlanMsg({ type: 'success', text: `Plan #${planId} actualizado.` })
      setEditingId(null)
      fetchPlans()
    } catch (err: any) {
      setPlanMsg({ type: 'error', text: err.response?.data?.message ?? 'Error al guardar.' })
    } finally {
      setSaving(false)
    }
  }

  const handleSync = async (force: boolean) => {
    setSyncing(true)
    setSyncResult(null)
    setSyncError('')
    try {
      const res = await adminApi.post<SyncResult>('/catalog/sync', { force })
      setSyncResult(res.data)
    } catch (err: any) {
      setSyncError(err.response?.data?.message ?? 'Error al sincronizar.')
    } finally {
      setSyncing(false)
    }
  }

  const logout = () => {
    sessionStorage.removeItem('adminAuthenticated')
    sessionStorage.removeItem('adminKey')
    navigate('/login/admin', { replace: true })
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>Q</span>
          <span>uetxal TV</span>
          <span className={styles.adminBadge}>ADMIN</span>
        </div>
        <button className="btn btn-secondary" onClick={logout}>
          Cerrar sesión
        </button>
      </header>

      <main className={styles.main}>
        {/* === PLANES === */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Planes de suscripción</h2>
            <p className={styles.cardSub}>
              Nombre y precio se guardan en la base de datos.
              Las características se almacenan en el navegador (localStorage).
            </p>
          </div>

          {planMsg && (
            <div className={planMsg.type === 'success' ? styles.successMsg : styles.errorMsg}>
              {planMsg.text}
            </div>
          )}

          {loadingPlans ? (
            <div className={styles.loading}><span className="spinner" /></div>
          ) : (
            <div className={styles.plansGrid}>
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`${styles.planCard} ${editingId === plan.id ? styles.editing : ''}`}
                >
                  <div className={styles.planTop}>
                    <span className={styles.planId}>#{plan.id}</span>
                    <span className={`${styles.planStatus} ${plan.is_active ? styles.active : styles.inactive}`}>
                      {plan.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>

                  {editingId === plan.id ? (
                    <div className={styles.editFields}>
                      <label className={styles.field}>
                        Nombre
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        />
                      </label>
                      <label className={styles.field}>
                        Precio (USD)
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editForm.price_usd}
                          onChange={(e) => setEditForm((f) => ({ ...f, price_usd: e.target.value }))}
                        />
                      </label>
                      <label className={styles.field}>
                        Características (una por línea)
                        <textarea
                          rows={4}
                          value={editForm.features}
                          onChange={(e) => setEditForm((f) => ({ ...f, features: e.target.value }))}
                        />
                      </label>
                      <div className={styles.editActions}>
                        <button
                          className="btn btn-primary"
                          onClick={() => savePlan(plan.id)}
                          disabled={saving}
                        >
                          {saving ? <span className="spinner" /> : 'Guardar'}
                        </button>
                        <button className="btn btn-secondary" onClick={cancelEdit} disabled={saving}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.planView}>
                      <div className={styles.planName}>{plan.name}</div>
                      <div className={styles.planPrice}>
                        ${plan.price_usd.toFixed(2)}{' '}
                        <span>USD/mes</span>
                      </div>
                      <ul className={styles.featureList}>
                        {plan.features.map((f) => <li key={f}>{f}</li>)}
                      </ul>
                      <button
                        className="btn btn-secondary"
                        style={{ width: '100%', marginTop: 'auto' }}
                        onClick={() => startEdit(plan)}
                      >
                        Editar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* === CATÁLOGO === */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Catálogo</h2>
            <p className={styles.cardSub}>
              Descarga contenido desde archive.org. El proceso puede tardar 1–3 minutos.
            </p>
          </div>

          <div className={styles.syncActions}>
            <button
              className="btn btn-primary"
              onClick={() => handleSync(false)}
              disabled={syncing}
            >
              {syncing ? <span className="spinner" /> : 'Sincronizar (solo faltantes)'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleSync(true)}
              disabled={syncing}
            >
              {syncing ? <span className="spinner" /> : 'Forzar re-sincronización'}
            </button>
          </div>

          {syncError && <div className={styles.errorMsg}>{syncError}</div>}

          {syncResult && (
            <div className={styles.syncResult}>
              <div className={`${styles.syncStatus} ${syncResult.success ? styles.syncOk : styles.syncFail}`}>
                {syncResult.success ? '✓' : '✕'} {syncResult.message}
              </div>
              {syncResult.success && (
                <div className={styles.syncStats}>
                  <div className={styles.stat}>
                    <span className={styles.statNum}>{syncResult.contents_synced ?? 0}</span>
                    <span className={styles.statLabel}>contenidos</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statNum}>{syncResult.episodes_synced ?? 0}</span>
                    <span className={styles.statLabel}>episodios</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
