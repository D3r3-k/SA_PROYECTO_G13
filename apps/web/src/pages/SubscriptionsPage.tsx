import { useEffect, useRef, useState } from 'react'
import AppLayout from '../layouts/AppLayout'
import api from '../services/api'
import { getPlanFeatures } from '../utils/planFeatures'
import styles from './SubscriptionsPage.module.css'

interface Plan {
  id: number | string
  name: string
  price_usd: number
  display_price?: number
  display_currency?: string
  fx_rate?: number
  fx_cached?: boolean
}

interface PlanDisplay extends Plan {
  features: string[]
  highlighted: boolean
}

interface Subscription {
  id: number
  plan_id: number
  plan_name: string
  price_usd: number
  status: string
  started_at: string
}

interface PaymentForm {
  card_number: string   // raw digits, sin espacios
  card_holder: string
  exp_month: string
  exp_year: string
  cvv: string
}

interface PaymentReceipt {
  transaction_id: string
  authorization_code: string
  amount: number
  currency: string
  card_last4: string
  provider: string
  plan_name: string
}

const PLAN_META: Record<string, { features: string[]; highlighted: boolean }> = {
  básico:   { highlighted: false, features: ['1 pantalla simultánea', 'Calidad HD', 'Sin descargas'] },
  basic:    { highlighted: false, features: ['1 pantalla simultánea', 'Calidad HD', 'Sin descargas'] },
  estándar: { highlighted: true,  features: ['2 pantallas simultáneas', 'Calidad Full HD', 'Descargas disponibles'] },
  standard: { highlighted: true,  features: ['2 pantallas simultáneas', 'Calidad Full HD', 'Descargas disponibles'] },
  premium:  { highlighted: false, features: ['4 pantallas simultáneas', 'Calidad 4K + HDR', 'Watch Party', 'Sin descargas por norma'] },
}

const FALLBACK_PLANS: PlanDisplay[] = [
  { id: 1, name: 'Básico',   price_usd: 5.0,  ...PLAN_META.básico },
  { id: 2, name: 'Estándar', price_usd: 8.0,  ...PLAN_META.estándar },
  { id: 3, name: 'Premium',  price_usd: 12.0, ...PLAN_META.premium },
]

const INITIAL_PAYMENT: PaymentForm = {
  card_number: '',
  card_holder: '',
  exp_month: '',
  exp_year: '',
  cvv: '',
}

function formatCardDisplay(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
}

function maskCardDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 16).padEnd(16, '·')
  return [digits.slice(0, 4), digits.slice(4, 8), digits.slice(8, 12), digits.slice(12, 16)]
    .join(' ')
}

export default function SubscriptionsPage() {
  const [plans, setPlans] = useState<PlanDisplay[]>(FALLBACK_PLANS)
  const [loading, setLoading] = useState(true)

  const [currentSub, setCurrentSub] = useState<Subscription | null>(null)
  const [loadingSub, setLoadingSub] = useState(true)
  const [cancelling, setCancelling] = useState(false)

  const [selectedPlan, setSelectedPlan] = useState<PlanDisplay | null>(null)
  const [subscribing, setSubscribing] = useState(false)
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null)
  const [error, setError] = useState('')

  const [currency, setCurrency] = useState('GTQ')
  const [payment, setPayment] = useState<PaymentForm>(INITIAL_PAYMENT)

  const cardInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    api.get<{ plans: Plan[] }>('/plans', { params: { currency } })
      .then((res) => {
        const merged = res.data.plans.map((p): PlanDisplay => {
          const key = p.name.toLowerCase()
          const meta = PLAN_META[key] ?? { features: [], highlighted: false }
          return { ...p, ...meta, features: getPlanFeatures(p.id, meta.features) }
        })
        if (merged.length) setPlans(merged)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [currency])

  useEffect(() => {
    api.get<{ subscriptions: Subscription[] }>('/subscriptions')
      .then((res) => {
        const active = res.data.subscriptions.find((s) => s.status === 'active') ?? null
        setCurrentSub(active)
      })
      .catch(() => {})
      .finally(() => setLoadingSub(false))
  }, [])

  const openModal = (plan: PlanDisplay) => {
    setSelectedPlan(plan)
    setError('')
  }

  const closeModal = () => {
    if (subscribing) return
    setSelectedPlan(null)
    setError('')
  }

  const handleCardNumberInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 16)
    setPayment((c) => ({ ...c, card_number: digits }))
    setError('')
  }

  const updateField = (field: keyof PaymentForm, value: string) => {
    setPayment((c) => ({ ...c, [field]: value }))
    setError('')
  }

  const subscribe = async () => {
    if (!selectedPlan) return
    setSubscribing(true)
    setError('')

    try {
      const res = await api.post('/subscriptions', {
        plan_id: Number(selectedPlan.id),
        currency,
        payment: {
          card_number: payment.card_number,
          card_holder: payment.card_holder,
          exp_month: Number(payment.exp_month),
          exp_year: Number(payment.exp_year),
          cvv: payment.cvv,
        },
      })

      const p = res.data?.payment
      const newReceipt: PaymentReceipt = {
        transaction_id:     p?.transaction_id     ?? '',
        authorization_code: p?.authorization_code ?? '',
        amount:             p?.amount             ?? selectedPlan.price_usd,
        currency:           p?.currency           ?? currency,
        card_last4:         p?.card_last4          ?? '****',
        provider:           p?.provider           ?? '',
        plan_name:          selectedPlan.name,
      }

      setCurrentSub({
        id:         res.data?.subscription?.id ?? 0,
        plan_id:    Number(selectedPlan.id),
        plan_name:  selectedPlan.name,
        price_usd:  selectedPlan.price_usd,
        status:     'active',
        started_at: new Date().toISOString(),
      })
      setReceipt(newReceipt)
      setSelectedPlan(null)
    } catch (err: any) {
      const p = err.response?.data?.payment
      const msg: string = err.response?.data?.message ?? ''
      const last4 = p?.card_last4 ? ` (**** **** **** ${p.card_last4})` : ''

      if (p?.status === 'declined') {
        setError(`Pago rechazado por el emisor${last4}. Verifica los datos o usa otra tarjeta.`)
      } else if (msg.toLowerCase().includes('funds')) {
        setError(`Fondos insuficientes${last4}. Intenta con otra tarjeta.`)
      } else if (p?.status === 'rejected' || msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('expired')) {
        setError(`Datos de tarjeta inválidos. ${msg}`)
      } else {
        setError(msg || 'No se pudo procesar el pago.')
      }
    } finally {
      setSubscribing(false)
    }
  }

  const cancelSubscription = async () => {
    if (!currentSub) return
    if (!window.confirm('¿Cancelar tu suscripción activa? Perderás el acceso al final del período.')) return
    setCancelling(true)
    try {
      await api.delete(`/subscriptions/${currentSub.id}`)
      setCurrentSub(null)
    } catch (err: any) {
      alert(err.response?.data?.message ?? 'No se pudo cancelar la suscripción.')
    } finally {
      setCancelling(false)
    }
  }

  const isCurrentPlan = (planId: number | string) =>
    currentSub?.status === 'active' && Number(currentSub.plan_id) === Number(planId)

  return (
    <AppLayout>
      <div className="container section">
        <div className={styles.header}>
          <h1 className={styles.title}>Elige tu plan</h1>
          <p className={styles.subtitle}>Sin contratos. Cancela cuando quieras.</p>
          <label style={{ display: 'inline-flex', gap: '.5rem', alignItems: 'center', marginTop: '1rem' }}>
            Moneda
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="GTQ">GTQ — Quetzal</option>
              <option value="USD">USD — Dólar</option>
              <option value="MXN">MXN — Peso Mexicano</option>
              <option value="EUR">EUR — Euro</option>
            </select>
          </label>
        </div>

        {/* Banner suscripción activa */}
        {!loadingSub && currentSub && (
          <div className={styles.activeSub}>
            <div className={styles.activeSubLeft}>
              <span className={styles.activeSubBadge}>Activa</span>
              <div>
                <p className={styles.activeSubName}>{currentSub.plan_name}</p>
                <p className={styles.activeSubPrice}>${currentSub.price_usd.toFixed(2)} USD / mes</p>
              </div>
            </div>
            <button
              className={`btn btn-secondary ${styles.cancelBtn}`}
              onClick={cancelSubscription}
              disabled={cancelling}
            >
              {cancelling ? <span className="spinner" /> : 'Cancelar suscripción'}
            </button>
          </div>
        )}

        {/* Recibo de pago aprobado */}
        {receipt && (
          <div className={styles.receiptCard}>
            <div className={styles.receiptHeader}>
              <span className={styles.receiptCheck}>✓</span>
              <span>Suscripción activada — <strong>{receipt.plan_name}</strong></span>
              <button className={styles.receiptDismiss} onClick={() => setReceipt(null)}>×</button>
            </div>
            <div className={styles.receiptGrid}>
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>ID de transacción</span>
                <span className={styles.receiptTx}>{receipt.transaction_id || '—'}</span>
              </div>
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>Autorización</span>
                <span className={styles.receiptValue}>{receipt.authorization_code || '—'}</span>
              </div>
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>Monto cobrado</span>
                <span className={styles.receiptValue}>{receipt.amount.toFixed(2)} {receipt.currency}</span>
              </div>
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>Tarjeta</span>
                <span className={styles.receiptValue}>**** **** **** {receipt.card_last4}</span>
              </div>
              {receipt.provider && (
                <div className={styles.receiptRow}>
                  <span className={styles.receiptLabel}>Procesador</span>
                  <span className={styles.receiptValue}>{receipt.provider}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Planes */}
        <div className={styles.grid}>
          {plans.map((plan) => {
            const isCurrent = isCurrentPlan(plan.id)
            return (
              <div
                key={plan.id}
                className={`${styles.planCard} ${plan.highlighted ? styles.highlighted : ''} ${isCurrent ? styles.currentPlan : ''}`}
              >
                {isCurrent && <span className={styles.currentBadge}>Tu plan actual</span>}
                {!isCurrent && plan.highlighted && <span className={styles.popularBadge}>Más popular</span>}

                <h2 className={styles.planName}>{plan.name}</h2>
                <div className={styles.priceRow}>
                  <span className={styles.price}>
                    {(plan.display_price ?? plan.price_usd).toFixed(2)}
                  </span>
                  <span className={styles.period}>{plan.display_currency ?? 'USD'} / mes</span>
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
                  className={`btn ${isCurrent ? 'btn-secondary' : plan.highlighted ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ width: '100%', marginTop: 'auto', opacity: isCurrent ? 0.5 : 1 }}
                  onClick={() => !isCurrent && openModal(plan)}
                  disabled={loading || isCurrent}
                >
                  {isCurrent ? 'Plan activo' : 'Pagar y suscribirme'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ===== MODAL DE PAGO ===== */}
      {selectedPlan && (
        <div className={styles.backdrop} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>

            {/* Header del modal */}
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>Confirmar suscripción</h2>
                <p className={styles.modalSub}>
                  Plan <strong>{selectedPlan.name}</strong> · {(selectedPlan.display_price ?? selectedPlan.price_usd).toFixed(2)} {selectedPlan.display_currency ?? 'USD'}/mes
                </p>
              </div>
              <button className={styles.modalClose} onClick={closeModal} aria-label="Cerrar">×</button>
            </div>

            {/* Tarjeta visual */}
            <div className={styles.cardVisual}>
              <div className={styles.cardTop}>
                <span className={styles.cardBrand}>QuetxalPay</span>
                <div className={styles.cardChip} />
              </div>
              <div className={styles.cardNumber}>
                {maskCardDisplay(payment.card_number)}
              </div>
              <div className={styles.cardBottom}>
                <div className={styles.cardField}>
                  <span className={styles.cardFieldLabel}>Titular</span>
                  <span className={styles.cardFieldValue}>
                    {payment.card_holder.toUpperCase() || 'TU NOMBRE'}
                  </span>
                </div>
                <div className={styles.cardField}>
                  <span className={styles.cardFieldLabel}>Vence</span>
                  <span className={styles.cardFieldValue}>
                    {payment.exp_month.padStart(2, '0') || 'MM'}/{String(payment.exp_year).slice(-2) || 'AA'}
                  </span>
                </div>
              </div>
            </div>

            {/* Campos de pago */}
            <div className={styles.modalBody}>
              <div className={styles.modalRow}>
                <label className={styles.modalField}>
                  <span className={styles.fieldLabel}>Moneda</span>
                  <select
                    value={currency}
                    onChange={(e) => { setCurrency(e.target.value); setError('') }}
                  >
                    <option value="GTQ">GTQ — Quetzal</option>
                    <option value="USD">USD — Dólar</option>
                    <option value="MXN">MXN — Peso Mexicano</option>
                    <option value="EUR">EUR — Euro</option>
                  </select>
                </label>
              </div>

              <label className={styles.modalField}>
                <span className={styles.fieldLabel}>Número de tarjeta</span>
                <input
                  ref={cardInputRef}
                  className={styles.cardInput}
                  value={formatCardDisplay(payment.card_number)}
                  onChange={(e) => handleCardNumberInput(e.target.value)}
                  placeholder="0000 0000 0000 0000"
                  inputMode="numeric"
                  maxLength={19}
                  autoComplete="cc-number"
                />
              </label>

              <label className={styles.modalField}>
                <span className={styles.fieldLabel}>Nombre en tarjeta</span>
                <input
                  value={payment.card_holder}
                  onChange={(e) => updateField('card_holder', e.target.value)}
                  placeholder="Como aparece en la tarjeta"
                  autoComplete="cc-name"
                />
              </label>

              <div className={styles.modalRow}>
                <label className={styles.modalField}>
                  <span className={styles.fieldLabel}>Mes exp.</span>
                  <input
                    value={payment.exp_month}
                    onChange={(e) => updateField('exp_month', e.target.value.replace(/\D/g, '').slice(0, 2))}
                    placeholder="MM"
                    inputMode="numeric"
                    maxLength={2}
                    autoComplete="cc-exp-month"
                  />
                </label>
                <label className={styles.modalField}>
                  <span className={styles.fieldLabel}>Año exp.</span>
                  <input
                    value={payment.exp_year}
                    onChange={(e) => updateField('exp_year', e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="AAAA"
                    inputMode="numeric"
                    maxLength={4}
                    autoComplete="cc-exp-year"
                  />
                </label>
                <label className={styles.modalField}>
                  <span className={styles.fieldLabel}>CVV</span>
                  <input
                    value={payment.cvv}
                    onChange={(e) => updateField('cvv', e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="•••"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    autoComplete="cc-csc"
                  />
                </label>
              </div>

              {error && <p className={styles.modalError}>{error}</p>}

              <p className={styles.testHint}>
                Sandbox — Aprobar: 4242 4242 4242 4242 · Rechazar: terminar en 0000 · Sin fondos: terminar en 1111
              </p>
            </div>

            {/* Footer del modal */}
            <div className={styles.modalFooter}>
              <button className="btn btn-secondary" onClick={closeModal} disabled={subscribing}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={subscribe} disabled={subscribing}>
                {subscribing
                  ? <span className="spinner" />
                  : `Pagar ${(selectedPlan.display_price ?? selectedPlan.price_usd).toFixed(2)} ${selectedPlan.display_currency ?? currency}`}
              </button>
            </div>

          </div>
        </div>
      )}
    </AppLayout>
  )
}
