import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../layouts/AppLayout'
import { catalogService, type ContentCard } from '../services/catalog.service'
import styles from './CatalogPage.module.css'

type TypeFilter = 'all' | 'movie' | 'series'

function releaseYear(date: string): string {
  if (!date) return ''
  const y = new Date(date).getFullYear()
  return isNaN(y) ? '' : String(y)
}

export default function CatalogPage() {
  const navigate = useNavigate()

  const [items, setItems]         = useState<ContentCard[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')
  const [genre, setGenre]         = useState('Todos')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  useEffect(() => {
    catalogService
      .list()
      .then((res) => setItems(res.data.items ?? []))
      .catch((err) => {
        const code = err?.response?.data?.code
        setError(code === 'ACTIVE_SUBSCRIPTION_REQUIRED'
          ? 'Necesitas una suscripción activa para ver el catálogo.'
          : 'No pudimos cargar el catálogo en este momento.')
      })
      .finally(() => setLoading(false))
  }, [])

  const byType = useMemo(
    () => (typeFilter === 'all' ? items : items.filter((i) => i.type === typeFilter)),
    [items, typeFilter],
  )

  const genres = useMemo(() => {
    const set = new Set<string>()
    byType.forEach((item) => item.genres?.forEach((g) => set.add(g.name)))
    return ['Todos', ...Array.from(set).sort()]
  }, [byType])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return byType.filter((item) => {
      const matchSearch = !q || item.title.toLowerCase().includes(q)
      const matchGenre  = genre === 'Todos' || item.genres?.some((g) => g.name === genre)
      return matchSearch && matchGenre
    })
  }, [byType, search, genre])

  return (
    <AppLayout>
      <div className={styles.hero}>
        <div className="container">
          <h1 className={styles.heroTitle}>Catálogo</h1>
          <p className={styles.heroSub}>Descubre películas y series</p>

          <div className={styles.searchBar}>
            <input
              className="input"
              placeholder="Buscar por título..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="container section">
        <div className={styles.filters}>
          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Tipo</span>
            <div className={styles.filterGroup}>
              {(['all', 'movie', 'series'] as TypeFilter[]).map((t) => (
                <button
                  key={t}
                  className={`btn btn-sm ${typeFilter === t ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => { setTypeFilter(t); setGenre('Todos') }}
                >
                  {t === 'all' ? 'Todo' : t === 'movie' ? 'Películas' : 'Series'}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filterDivider} />

          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Género</span>
            <div className={styles.genreScroll}>
              {genres.map((g) => (
                <button
                  key={g}
                  className={`btn btn-sm ${genre === g ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setGenre(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && (
          <div className={styles.empty}>
            <p>Cargando catálogo...</p>
          </div>
        )}

        {!loading && error && (
          <div className={styles.empty}>
            <p>{error}</p>
            {error.includes('suscripción') ? (
              <button className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }} onClick={() => navigate('/subscriptions')}>
                Ver planes
              </button>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                style={{ marginTop: '1rem' }}
                onClick={() => {
                  setLoading(true)
                  setError('')
                  catalogService
                    .list()
                    .then((res) => setItems(res.data.items ?? []))
                    .catch(() => setError('No pudimos cargar el catálogo en este momento.'))
                    .finally(() => setLoading(false))
                }}
              >
                Reintentar
              </button>
            )}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className={styles.empty}>
            <p>
              {items.length === 0
                ? 'Aún no hay contenido disponible.'
                : 'No se encontraron resultados para tu búsqueda.'}
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className={styles.grid}>
            {filtered.map((item) => {
              const year = releaseYear(item.release_date)
              const firstGenre = item.genres?.[0]?.name ?? ''

              return (
                <div
                  key={item.content_id}
                  className={styles.card}
                  onClick={() => navigate(`/catalog/${item.content_id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={styles.thumbnail}>
                    {item.poster_path ? (
                      <img src={item.poster_path} alt={item.title} loading="lazy" />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '3rem',
                          background: 'var(--color-surface-light)',
                        }}
                      >
                        {item.type === 'movie' ? '🎬' : '📺'}
                      </div>
                    )}
                    <div className={styles.overlay}>
                      <button className="btn btn-primary btn-sm">Ver ahora</button>
                    </div>
                    <span className={`badge badge-info ${styles.typeBadge}`}>
                      {item.type === 'movie' ? 'Película' : 'Serie'}
                    </span>
                    <span className="badge badge-info" style={{ position: 'absolute', right: 12, bottom: 12 }}>
                      {item.maturity_rating || 'ALL'}
                    </span>
                  </div>
                  <div className={styles.info}>
                    <h3 className={styles.itemTitle}>{item.title}</h3>
                    <p className={styles.itemMeta}>
                      {[firstGenre, year].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
