import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppLayout from '../layouts/AppLayout'
import {
  listOfflineDownloads,
  removeOfflineDownload,
  type OfflineDownloadRecord,
} from '../services/offlineDownloads.service'
import styles from './DownloadsPage.module.css'

type DownloadAvailability = 'ready' | 'local' | 'limited'

function getAvailability(record: OfflineDownloadRecord): DownloadAvailability {
  if (record.cache_status === 'cached' || record.cache_status === 'cached_opaque') return 'ready'
  if (record.cache_status === 'simulated_placeholder') return 'local'
  return 'limited'
}

function statusCopy(record: OfflineDownloadRecord): { label: string; description: string; tone: string } {
  switch (getAvailability(record)) {
    case 'ready':
      return {
        label: 'Disponible en este dispositivo',
        description: 'Puedes abrirlo desde tus descargas guardadas.',
        tone: styles.statusReady,
      }
    case 'local':
      return {
        label: 'Guardado en este dispositivo',
        description: 'El contenido quedó agregado a tus descargas.',
        tone: styles.statusLocal,
      }
    default:
      return {
        label: 'Guardado con acceso limitado',
        description: 'La descarga quedó registrada, pero este navegador no pudo preparar el acceso local completo.',
        tone: styles.statusLimited,
      }
  }
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('es-GT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch (_) {
    return value
  }
}

function contentInitial(title: string): string {
  return (title || 'Q').trim().slice(0, 1).toUpperCase()
}

export default function DownloadsPage() {
  const [downloads, setDownloads] = useState<OfflineDownloadRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [removingId, setRemovingId] = useState('')

  const loadDownloads = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setDownloads(await listOfflineDownloads())
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar tus descargas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDownloads()
  }, [loadDownloads])

  const readyCount = useMemo(
    () => downloads.filter((item) => getAvailability(item) === 'ready').length,
    [downloads],
  )

  const lastDownload = downloads[0]?.created_at ? formatDate(downloads[0].created_at) : 'Sin descargas'

  const handleRemove = async (item: OfflineDownloadRecord) => {
    if (removingId) return
    setRemovingId(item.id)
    setError('')
    try {
      await removeOfflineDownload(item.id, item.cache_key)
      await loadDownloads()
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar la descarga.')
    } finally {
      setRemovingId('')
    }
  }

  return (
    <AppLayout>
      <section className={styles.section}>
        <div className="container">
          <div className={styles.hero}>
            <div className={styles.heroText}>
              <span className={styles.kicker}>Descargas</span>
              <h1 className={styles.title}>Tus contenidos guardados</h1>
              <p className={styles.subtitle}>
                Aquí aparecen las películas y episodios que guardaste en este navegador para accederlos de forma rápida y segura desde este mismo dispositivo.
              </p>
              <div className={styles.heroActions}>
                <button className="btn btn-primary btn-sm" onClick={loadDownloads} disabled={loading}>
                  {loading ? 'Actualizando...' : 'Actualizar lista'}
                </button>
                <Link className="btn btn-ghost btn-sm" to="/catalog">
                  Explorar catálogo
                </Link>
              </div>
            </div>

            <div className={styles.summaryPanel} aria-label="Resumen de descargas">
              <div className={styles.summaryItem}>
                <span className={styles.summaryValue}>{downloads.length}</span>
                <span className={styles.summaryLabel}>guardadas</span>
              </div>
              <div className={styles.summaryDivider} />
              <div className={styles.summaryItem}>
                <span className={styles.summaryValue}>{readyCount}</span>
                <span className={styles.summaryLabel}>listas</span>
              </div>
              <div className={styles.summaryFooter}>
                Última descarga: {lastDownload}
              </div>
            </div>
          </div>

          <div className={styles.notice}>
            <span className={styles.noticeIcon}>🔒</span>
            <div>
              <strong>Protegidas en tu dispositivo</strong>
              <p>Por seguridad, las descargas solo están disponibles en el dispositivo donde fueron guardadas.</p>
            </div>
          </div>

          {error && <div className={styles.alert}>{error}</div>}

          {!error && loading && (
            <div className={styles.loadingState}>
              <div className="spinner" />
              <p>Cargando tus descargas...</p>
            </div>
          )}

          {!error && !loading && downloads.length === 0 && (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>⬇️</div>
              <h2>Aún no tienes contenidos guardados</h2>
              <p>Cuando descargues una película o episodio, aparecerá aquí para que puedas encontrarlo fácilmente.</p>
              <Link className="btn btn-primary btn-sm" to="/catalog">
                Ir al catálogo
              </Link>
            </div>
          )}

          {!error && downloads.length > 0 && (
            <div className={styles.grid}>
              {downloads.map((item) => {
                const copy = statusCopy(item)
                const canOpen = getAvailability(item) === 'ready'

                return (
                  <article key={item.id} className={styles.card}>
                    <div className={styles.artwork}>
                      <span>{contentInitial(item.title)}</span>
                    </div>

                    <div className={styles.cardBody}>
                      <div className={styles.cardHeader}>
                        <div>
                          <h2 className={styles.cardTitle}>{item.title}</h2>
                          <p className={styles.meta}>{item.subtitle}</p>
                        </div>
                        <span className={`${styles.statusPill} ${copy.tone}`}>{copy.label}</span>
                      </div>

                      <p className={styles.description}>{copy.description}</p>

                      <div className={styles.details}>
                        <span>{item.maturity_rating || 'ALL'}</span>
                        <span>Contenido protegido</span>
                        <span>Guardado: {formatDate(item.created_at)}</span>
                      </div>

                      <div className={styles.cardActions}>
                        {canOpen ? (
                          <a className="btn btn-primary btn-sm" href={item.cache_key} target="_blank" rel="noreferrer">
                            Abrir descarga
                          </a>
                        ) : (
                          <button className="btn btn-secondary btn-sm" disabled>
                            No disponible sin conexión
                          </button>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleRemove(item)}
                          disabled={Boolean(removingId)}
                        >
                          {removingId === item.id ? 'Eliminando...' : 'Quitar'}
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </AppLayout>
  )
}
