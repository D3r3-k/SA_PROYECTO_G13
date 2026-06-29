import { useCallback, useEffect, useState } from 'react'
import AppLayout from '../layouts/AppLayout'
import { listOfflineDownloads, type OfflineDownloadRecord } from '../services/offlineDownloads.service'
import styles from './DownloadsPage.module.css'

function cacheStatusLabel(status: OfflineDownloadRecord['cache_status']): string {
  switch (status) {
    case 'cached':
      return 'Video cacheado'
    case 'cached_opaque':
      return 'Video cacheado opaco'
    case 'simulated_placeholder':
      return 'Cache simulado local'
    case 'unsupported':
      return 'SW no soportado'
    default:
      return 'Cache no disponible'
  }
}

export default function DownloadsPage() {
  const [downloads, setDownloads] = useState<OfflineDownloadRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadDownloads = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setDownloads(await listOfflineDownloads())
    } catch (err: any) {
      setError(err?.message || 'No se pudieron leer las descargas locales')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDownloads()
  }, [loadDownloads])

  return (
    <AppLayout>
      <section className={styles.section}>
        <div className="container">
          <div className={styles.header}>
            <div>
              <h1 className={styles.title}>Mis descargas</h1>
              <p className={styles.subtitle}>
                Evidencia: los grants se guardan cifrados en IndexedDB y el Service Worker intenta cachear el recurso multimedia en Cache Storage.
              </p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={loadDownloads} disabled={loading}>
              {loading ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>

          {error && <div className={styles.empty}>{error}</div>}

          {!error && !loading && downloads.length === 0 && (
            <div className={styles.empty}>Aún no hay descargas locales guardadas en este navegador.</div>
          )}

          {!error && downloads.length > 0 && (
            <div className={styles.grid}>
              {downloads.map((item) => (
                <article key={item.id} className={styles.card}>
                  <h2 className={styles.cardTitle}>{item.title}</h2>
                  <p className={styles.meta}>{item.subtitle}</p>
                  <div className={styles.badges}>
                    <span className="badge badge-info">{item.maturity_rating}</span>
                    <span className="badge badge-info">{item.media_mime_type}</span>
                    <span className="badge badge-success">{cacheStatusLabel(item.cache_status)}</span>
                  </div>
                  <a className="btn btn-ghost btn-sm" href={item.cache_key} target="_blank" rel="noreferrer">
                    Abrir recurso local
                  </a>
                  <p className={styles.cacheKey}>Cache key: {item.cache_key}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppLayout>
  )
}
