import AppLayout from '../layouts/AppLayout'
import styles from './HistoryPage.module.css'

interface HistoryItem {
  id: string
  title: string
  type: 'movie' | 'series'
  thumbnail: string
  minute: number
  duration: number
  season?: number
  episode?: number
  updatedAt: string
}

const MOCK_HISTORY: HistoryItem[] = [
  {
    id: '1', title: 'El Origen del Tiempo', type: 'movie',
    thumbnail: 'https://picsum.photos/seed/movie1/300/450',
    minute: 72, duration: 120, updatedAt: '2026-06-05T20:30:00Z',
  },
  {
    id: '2', title: 'Sombras del Pasado', type: 'series',
    thumbnail: 'https://picsum.photos/seed/series1/300/450',
    minute: 18, duration: 45, season: 2, episode: 4, updatedAt: '2026-06-04T18:00:00Z',
  },
  {
    id: '3', title: 'Noches de Neón', type: 'series',
    thumbnail: 'https://picsum.photos/seed/series2/300/450',
    minute: 33, duration: 50, season: 1, episode: 7, updatedAt: '2026-06-03T22:15:00Z',
  },
]

function formatProgress(minute: number, duration: number) {
  const pct = Math.round((minute / duration) * 100)
  return { pct, label: `${minute} min de ${duration} min` }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-GT', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function HistoryPage() {
  return (
    <AppLayout>
      <div className="container section">
        <h1 className={styles.title}>Continuar viendo</h1>
        <p className={styles.subtitle}>
          Retoma donde lo dejaste
        </p>

        {MOCK_HISTORY.length === 0 ? (
          <div className={styles.empty}>
            <p>Tu historial está vacío. ¡Empieza a ver algo!</p>
          </div>
        ) : (
          <div className={styles.list}>
            {MOCK_HISTORY.map((item) => {
              const { pct, label } = formatProgress(item.minute, item.duration)
              return (
                <div key={item.id} className={styles.item}>
                  <div className={styles.thumb}>
                    <img src={item.thumbnail} alt={item.title} />
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className={styles.details}>
                    <h3 className={styles.itemTitle}>{item.title}</h3>
                    {item.type === 'series' && item.season && item.episode && (
                      <p className={styles.episodeMeta}>
                        Temporada {item.season} · Capítulo {item.episode}
                      </p>
                    )}
                    <p className={styles.progressLabel}>{label} ({pct}%)</p>
                    <p className={styles.date}>Visto el {formatDate(item.updatedAt)}</p>
                  </div>

                  <button className="btn btn-primary btn-sm">
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
