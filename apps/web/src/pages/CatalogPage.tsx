import { useState } from 'react'
import AppLayout from '../layouts/AppLayout'
import styles from './CatalogPage.module.css'

interface ContentItem {
  id: string
  title: string
  genre: string
  year: number
  rating: number
  type: 'movie' | 'series'
  thumbnail: string
}

const MOCK_CONTENT: ContentItem[] = [
  { id: '1', title: 'El Origen del Tiempo', genre: 'Ciencia Ficción', year: 2023, rating: 95, type: 'movie',  thumbnail: 'https://picsum.photos/seed/movie1/300/450' },
  { id: '2', title: 'Sombras del Pasado',  genre: 'Drama',           year: 2022, rating: 88, type: 'series', thumbnail: 'https://picsum.photos/seed/series1/300/450' },
  { id: '3', title: 'La Gran Aventura',    genre: 'Aventura',        year: 2024, rating: 91, type: 'movie',  thumbnail: 'https://picsum.photos/seed/movie2/300/450' },
  { id: '4', title: 'Noches de Neón',      genre: 'Thriller',        year: 2023, rating: 84, type: 'series', thumbnail: 'https://picsum.photos/seed/series2/300/450' },
  { id: '5', title: 'El Último Horizonte', genre: 'Acción',          year: 2024, rating: 92, type: 'movie',  thumbnail: 'https://picsum.photos/seed/movie3/300/450' },
  { id: '6', title: 'Mundos Paralelos',    genre: 'Ciencia Ficción', year: 2022, rating: 87, type: 'series', thumbnail: 'https://picsum.photos/seed/series3/300/450' },
  { id: '7', title: 'Sin Retorno',         genre: 'Suspense',        year: 2023, rating: 79, type: 'movie',  thumbnail: 'https://picsum.photos/seed/movie4/300/450' },
  { id: '8', title: 'La Familia Pérez',    genre: 'Comedia',         year: 2024, rating: 83, type: 'series', thumbnail: 'https://picsum.photos/seed/series4/300/450' },
]

const GENRES = ['Todos', 'Acción', 'Aventura', 'Ciencia Ficción', 'Comedia', 'Drama', 'Suspense', 'Thriller']

export default function CatalogPage() {
  const [search, setSearch] = useState('')
  const [genre, setGenre] = useState('Todos')
  const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'series'>('all')

  const filtered = MOCK_CONTENT.filter((item) => {
    const matchSearch = item.title.toLowerCase().includes(search.toLowerCase())
    const matchGenre  = genre === 'Todos' || item.genre === genre
    const matchType   = typeFilter === 'all' || item.type === typeFilter
    return matchSearch && matchGenre && matchType
  })

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
          <div className={styles.filterGroup}>
            {(['all', 'movie', 'series'] as const).map((t) => (
              <button
                key={t}
                className={`btn btn-sm ${typeFilter === t ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setTypeFilter(t)}
              >
                {t === 'all' ? 'Todo' : t === 'movie' ? 'Películas' : 'Series'}
              </button>
            ))}
          </div>

          <div className={styles.genreScroll}>
            {GENRES.map((g) => (
              <button
                key={g}
                className={`btn btn-sm ${genre === g ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setGenre(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <p>No se encontraron resultados para tu búsqueda.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((item) => (
              <div key={item.id} className={styles.card}>
                <div className={styles.thumbnail}>
                  <img src={item.thumbnail} alt={item.title} loading="lazy" />
                  <div className={styles.overlay}>
                    <button className="btn btn-primary btn-sm">Reproducir</button>
                  </div>
                  <span className={`badge badge-info ${styles.typeBadge}`}>
                    {item.type === 'movie' ? 'Película' : 'Serie'}
                  </span>
                  <span className={styles.ratingBadge}>
                    {item.rating}% 👍
                  </span>
                </div>
                <div className={styles.info}>
                  <h3 className={styles.itemTitle}>{item.title}</h3>
                  <p className={styles.itemMeta}>{item.genre} · {item.year}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
