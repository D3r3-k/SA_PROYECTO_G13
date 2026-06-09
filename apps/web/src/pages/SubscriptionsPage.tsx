import { useEffect, useState } from 'react'
import AppLayout from '../layouts/AppLayout'
import api from '../services/api'
import { getPlanFeatures } from '../utils/planFeatures'
import styles from './SubscriptionsPage.module.css'

interface Plan {
  id: number | string
  name: string
  price_usd: number
}

interface PlanDisplay extends Plan {
  features: string[]
  highlighted: boolean
}

interface PaymentForm {
  card_number: string
  card_holder: string
  exp_month: string
  exp_year: string
  cvv: string
}

const PLAN_META: Record<string, { features: string[]; highlighted: boolean }> = {
  básico: {
    highlighted: false,
    features: ['1 pantalla simultánea', 'Calidad HD', 'Sin descargas'],
  },
  basic: {
    highlighted: false,
    features: ['1 pantalla simultánea', 'Calidad HD', 'Sin descargas'],
  },
  estándar: {
    highlighted: true,
    features: ['2 pantallas simultáneas', 'Calidad Full HD', 'Descargas limitadas'],
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
  { id: 1, name: 'Básico', price_usd: 5.0, ...PLAN_META.básico },
  { id: 2, name: 'Estándar', price_usd: 8.0, ...PLAN_META.estándar },
  { id: 3, name: 'Premium', price_usd: 12.0, ...PLAN_META.premium },
]

const INITIAL_PAYMENT: PaymentForm = {
  card_number: '4242424242424242',
  card_holder: 'Usuario Demo',
  exp_month: '12',
  exp_year: '2028',
  cvv: '123',
}

export default function SubscriptionsPage() {
  const [plans, setPlans] = useState<PlanDisplay[]>(FALLBACK_PLANS)
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState<number | string | null>(null)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [currency, setCurrency] = useState('GTQ')
  const [payment, setPayment] = useState<PaymentForm>(INITIAL_PAYMENT)

  useEffect(() => {
    api.get<{ plans: Plan[] }>('/plans')
      .then((res) => {
        const merged = res.data.plans.map((p): PlanDisplay => {
          const key = p.name.toLowerCase()
          const meta = PLAN_META[key] ?? { features: [], highlighted: false }
          return { ...p, ...meta, features: getPlanFeatures(p.id, meta.features) }
        })
        if (merged.length) setPlans(merged)
      })
      .catch(() => { /* usa fallback */ })
      .finally(() => setLoading(false))
  }, [])

  const updatePayment = (field: keyof PaymentForm, value: string) => {
    setPayment((current) => ({ ...current, [field]: value }))
  }

  const subscribe = async (planId: number | string) => {
    setSubscribing(planId)
    setSuccess('')
    setError('')

    try {
      const res = await api.post('/subscriptions', {
        plan_id: Number(planId),
        currency,
        payment: {
          card_number: payment.card_number,
          card_holder: payment.card_holder,
          exp_month: Number(payment.exp_month),
          exp_year: Number(payment.exp_year),
          cvv: payment.cvv,
        },
      })

      const tx = res.data?.payment?.transaction_id
      setSuccess(tx
        ? `¡Suscripción activada correctamente! Transacción: ${tx}`
        : '¡Suscripción activada correctamente!'
      )
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo procesar el pago.')
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

        {success && <div className={styles.successMsg}>{success}</div>}
        {error && <div className={styles.errorMsg}>{error}</div>}

        <div className={styles.paymentBox}>
          <div>
            <h2 className={styles.paymentTitle}>Pago simulado</h2>
            <p className={styles.paymentHint}>
              Usa 4242 4242 4242 4242 para aprobar. Usa 4000 0000 0002 0000 para rechazar.
            </p>
          </div>

          <div className={styles.paymentGrid}>
            <label className={styles.field}>
              Moneda
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="GTQ">GTQ</option>
                <option value="USD">USD</option>
                <option value="MXN">MXN</option>
                <option value="EUR">EUR</option>
              </select>
            </label>

            <label className={styles.field}>
              Número de tarjeta
              <input
                value={payment.card_number}
                onChange={(e) => updatePayment('card_number', e.target.value)}
                placeholder="4242424242424242"
              />
            </label>

            <label className={styles.field}>
              Nombre en tarjeta
              <input
                value={payment.card_holder}
                onChange={(e) => updatePayment('card_holder', e.target.value)}
                placeholder="Usuario Demo"
              />
            </label>

            <label className={styles.field}>
              Mes
              <input
                value={payment.exp_month}
                onChange={(e) => updatePayment('exp_month', e.target.value)}
                placeholder="12"
              />
            </label>

            <label className={styles.field}>
              Año
              <input
                value={payment.exp_year}
                onChange={(e) => updatePayment('exp_year', e.target.value)}
                placeholder="2028"
              />
            </label>

            <label className={styles.field}>
              CVV
              <input
                value={payment.cvv}
                onChange={(e) => updatePayment('cvv', e.target.value)}
                placeholder="123"
              />
            </label>
          </div>
        </div>

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
                <span className={styles.period}>USD / mes</span>
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
                {subscribing === plan.id ? <span className="spinner" /> : 'Pagar y suscribirme'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
