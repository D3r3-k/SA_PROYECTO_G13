import { useEffect, useState } from 'react'
import AppLayout from '../layouts/AppLayout'
import api from '../services/api'
import styles from './SubscriptionsPage.module.css'

interface Plan {
  id: string
  name: string
  price_usd: number
}

interface PlanDisplay extends Plan {
  features: string[]
  highlighted: boolean
}

const PLAN_META: Record<string, { features: string[]; highlighted: boolean }> = {
  basic: {
    highlighted: false,
    features: ['1 pantalla simultánea', 'Calidad HD', 'Sin descargas'],
  },
  standard: {
    highlighted: true,
    features: ['2 pantallas simultáneas', 'Calidad Full HD', 'Descargas limitadas'],
  },
  premium: {
    highlighted: false,
    features: ['4 pantallas simultáneas', 'Calidad 4K + HDR', 'Descargas ilimitadas'],
  },
}

const FALLBACK_PLANS: PlanDisplay[] = [
  { id: 'basic',    name: 'Básico',   price_usd: 8.99,  ...PLAN_META.basic },
  { id: 'standard', name: 'Estándar', price_usd: 13.99, ...PLAN_META.standard },
  { id: 'premium',  name: 'Premium',  price_usd: 17.99, ...PLAN_META.premium },
]

export default function SubscriptionsPage() {
  const [plans, setPlans] = useState<PlanDisplay[]>(FALLBACK_PLANS)
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [success, setSuccess] = useState('')

  useEffect(() => {
    api.get<{ plans: Plan[] }>('/plans')
      .then((res) => {
        const merged = res.data.plans.map((p): PlanDisplay => {
          const key = p.name.toLowerCase()
          const meta = PLAN_META[key] ?? { features: [], highlighted: false }
          return { ...p, ...meta }
        })
        if (merged.length) setPlans(merged)
      })
      .catch(() => { /* usa fallback */ })
      .finally(() => setLoading(false))
  }, [])

  const subscribe = async (planId: string) => {
    setSubscribing(planId)
    try {
      await api.post('/subscriptions', { user_id: 1, plan_id: planId })
      setSuccess('¡Suscripción activada correctamente!')
    } catch {
      setSuccess('')
    } finally {
      setSubscribing(null)
    }
  }

  return (
    <AppLayout>
      <div className="container section">
        <div className={styles.header}>
          <h1 className={styles.title}>Elige tu plan</h1>
          <p className={styles.subtitle}>
            Sin contratos. Cancela cuando quieras.
          </p>
        </div>

        {success && (
          <div className={styles.successMsg}>{success}</div>
        )}

        <div className={styles.grid}>
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`${styles.planCard} ${plan.highlighted ? styles.highlighted : ''}`}
            >
              {plan.highlighted && (
                <span className={styles.popularBadge}>Más popular</span>
              )}
              <h2 className={styles.planName}>{plan.name}</h2>
              <div className={styles.priceRow}>
                <span className={styles.price}>
                  ${plan.price_usd.toFixed(2)}
                </span>
                <span className={styles.period}>/mes</span>
              </div>

              <ul className={styles.features}>
                {plan.features.map((f) => (
                  <li key={f} className={styles.feature}>
                    <span className={styles.check}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                className={`btn ${plan.highlighted ? 'btn-primary' : 'btn-secondary'}`}
                style={{ width: '100%', marginTop: 'auto' }}
                onClick={() => subscribe(plan.id)}
                disabled={loading || subscribing === plan.id}
              >
                {subscribing === plan.id ? <span className="spinner" /> : 'Suscribirme'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
