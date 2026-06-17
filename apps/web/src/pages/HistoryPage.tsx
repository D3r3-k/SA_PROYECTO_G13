import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../layouts/AppLayout'
import { useAuth } from '../hooks/useAuth'
import { engagementService, type HistoryItem } from '../services/engagement.service'
import { catalogService, type ContentCard } from '../services/catalog.service'
import styles from './HistoryPage.module.css'

interface EnrichedItem {
  history: HistoryItem
  content: ContentCard | null
}

function formatUpdatedAt(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') {
    return new Date(value).toLocaleDateString('es-GT', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  }
  if (typeof value === 'object' && value !== null) {
    const ts = value as { seconds?: string | number }
    if (ts.seconds) {
      return new Date(Number(ts.seconds) * 1000).toLocaleDateString('es-GT', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    }
  }
  return ''
}

export default function HistoryPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [items, setItems]     = useState<EnrichedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    const profileId = user?.profile_id
    if (!profileId) {
      setLoading(false)
      return
    }

    Promise.all([
      engagementService.getHistory(profileId, 15),
      catalogService.list(),
    ])
      .then(([histRes, catRes]) => {
        const histItems = histRes.data.items ?? []
        const catalog: ContentCard[] = catRes.data.items ?? []
        const catalogMap = new Map(catalog.map((c) => [c.content_id, c]))

        const enriched: EnrichedItem[] = histItems.map((h) => ({
          history: h,
          content: catalogMap.get(h.content_id) ?? null,
        }))

        setItems(enriched)
      })
      .catch(() => setError('No se pudo cargar el historial.'))
      .finally(() => setLoading(false))
  }, [user])

  return (
    <AppLayout>
      <div className="container section">
        <h1 className={styles.title}>Continuar viendo</h1>
        <p className={styles.subtitle}>Retoma donde lo dejaste</p>

        {loading && (
          <div className={styles.empty}><p>Cargando historial...</p></div>
        )}

        {!loading && error && (
          <div className={styles.empty}><p>{error}</p></div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className={styles.empty}>
            <p>Tu historial está vacío. ¡Empieza a ver algo!</p>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className={styles.list}>
            {items.map(({ history, content }) => {
              const title    = content?.title ?? `Contenido (${history.content_id.slice(0, 8)}...)`
              const poster   = content?.poster_path ?? ''
              const isSeries = history.season_number > 0 || history.episode_number > 0
              const date     = formatUpdatedAt(history.updated_at)

              return (
                <div
                  key={`${history.content_id}-${history.season_number}-${history.episode_number}`}
                  className={styles.item}
                >
                  <div className={styles.thumb}>
                    {poster ? (
                      <img src={poster} alt={title} />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.5rem',
                          background: 'var(--color-surface-light)',
                        }}
                      >
                        {isSeries ? '📺' : '🎬'}
                      </div>
                    )}
                    {history.minute > 0 && (
                      <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{ width: '40%' }} />
                      </div>
                    )}
                  </div>

                  <div className={styles.details}>
                    <h3 className={styles.itemTitle}>{title}</h3>
                    {isSeries && (
                      <p className={styles.episodeMeta}>
                        Temporada {history.season_number} · Capítulo {history.episode_number}
                      </p>
                    )}
                    {history.minute > 0 && (
                      <p className={styles.progressLabel}>
                        Visto hasta el minuto {history.minute}
                      </p>
                    )}
                    {date && (
                      <p className={styles.date}>Visto el {date}</p>
                    )}
                  </div>

                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => navigate(`/catalog/${history.content_id}`)}
                  >
                    Continuar
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
