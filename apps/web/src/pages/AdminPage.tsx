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

interface EpisodeForm {
  seasonNumber: string
  episodeNumber: string
  title: string
  overview: string
  runtimeMinutes: string
  videoFile: File | null
}

interface MediaForm {
  type: 'movie' | 'series'
  title: string
  overview: string
  releaseDate: string
  genres: string
  cast: string
}

interface CreateContentResponse {
  success: boolean
  message: string
  content_id: string
  episodes: Array<{
    episode_id: string
    season_number: number
    episode_number: number
    title: string
  }>
}

interface UploadUrlResponse {
  success: boolean
  message: string
  upload_url: string
  object_key: string
  expires_in_minutes: number
}

const initialMediaForm: MediaForm = {
  type: 'movie',
  title: '',
  overview: '',
  releaseDate: '',
  genres: '',
  cast: '',
}

const initialEpisode = (episodeNumber = 1): EpisodeForm => ({
  seasonNumber: '1',
  episodeNumber: String(episodeNumber),
  title: '',
  overview: '',
  runtimeMinutes: '',
  videoFile: null,
})

function logAdminPageError(message: string, error: unknown) {
  const details = error instanceof Error ? error.message : String(error)
  console.error(`[AdminPage.tsx] Error: ${message}: ${details}`)
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
  const [mediaForm, setMediaForm] = useState<MediaForm>(initialMediaForm)
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [movieVideoFile, setMovieVideoFile] = useState<File | null>(null)
  const [episodes, setEpisodes] = useState<EpisodeForm[]>([initialEpisode()])
  const [creatingContent, setCreatingContent] = useState(false)
  const [contentMsg, setContentMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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
    } catch (error) {
      logAdminPageError('Error al cargar planes', error)
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
      logAdminPageError('Error al guardar plan', err)
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
      logAdminPageError('Error al sincronizar catalogo', err)
      setSyncError(err.response?.data?.message ?? 'Error al sincronizar.')
    } finally {
      setSyncing(false)
    }
  }

  const parseCSV = (value: string) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

  const parseCast = (value: string) =>
    value
      .split('\n')
      .map((item, index) => {
        const [actorName, characterName = ''] = item.split('|').map((part) => part.trim())
        return { actorName, characterName, orderIndex: index }
      })
      .filter((item) => item.actorName)

  const updateEpisode = (index: number, patch: Partial<EpisodeForm>) => {
    setEpisodes((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const addEpisode = () => {
    setEpisodes((items) => [...items, initialEpisode(items.length + 1)])
  }

  const removeEpisode = (index: number) => {
    setEpisodes((items) => (items.length > 1 ? items.filter((_, i) => i !== index) : items))
  }

  const uploadAndConfirm = async (
    contentId: string,
    mediaType: 'poster' | 'movie_video' | 'episode_video',
    file: File,
    episodeId = ''
  ) => {
    const uploadRes = await adminApi.post<UploadUrlResponse>('/media/upload-url', {
      contentId,
      episodeId,
      mediaType,
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    })

    await fetch(uploadRes.data.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`GCS upload failed with status ${response.status}`)
      }
    })

    await adminApi.post('/media/confirm', {
      contentId,
      episodeId,
      mediaType,
      objectKey: uploadRes.data.object_key,
      contentType: file.type,
    })
  }

  const handleCreateContent = async () => {
    setCreatingContent(true)
    setContentMsg(null)
    try {
      if (!mediaForm.title.trim()) {
        throw new Error('El titulo es requerido.')
      }
      if (!posterFile) {
        throw new Error('La portada es requerida.')
      }
      if (mediaForm.type === 'movie' && !movieVideoFile) {
        throw new Error('El video de la pelicula es requerido.')
      }
      if (mediaForm.type === 'series' && episodes.some((episode) => !episode.title.trim() || !episode.videoFile)) {
        throw new Error('Cada episodio necesita titulo y video.')
      }

      const contentRes = await adminApi.post<CreateContentResponse>('/catalog/content', {
        type: mediaForm.type,
        title: mediaForm.title.trim(),
        overview: mediaForm.overview.trim(),
        releaseDate: mediaForm.releaseDate,
        genres: parseCSV(mediaForm.genres),
        cast: parseCast(mediaForm.cast),
        episodes:
          mediaForm.type === 'series'
            ? episodes.map((episode) => ({
                seasonNumber: Number(episode.seasonNumber || 1),
                episodeNumber: Number(episode.episodeNumber || 0),
                title: episode.title.trim(),
                overview: episode.overview.trim(),
                runtimeMinutes: Number(episode.runtimeMinutes || 0),
              }))
            : [],
      })

      const contentId = contentRes.data.content_id
      await uploadAndConfirm(contentId, 'poster', posterFile)

      if (mediaForm.type === 'movie' && movieVideoFile) {
        await uploadAndConfirm(contentId, 'movie_video', movieVideoFile)
      }

      if (mediaForm.type === 'series') {
        for (const episode of episodes) {
          const created = contentRes.data.episodes.find(
            (item) =>
              item.season_number === Number(episode.seasonNumber || 1) &&
              item.episode_number === Number(episode.episodeNumber || 0)
          )
          if (!created || !episode.videoFile) {
            throw new Error(`No se pudo resolver el episodio ${episode.episodeNumber}.`)
          }
          await uploadAndConfirm(contentId, 'episode_video', episode.videoFile, created.episode_id)
        }
      }

      setContentMsg({ type: 'success', text: `Contenido creado: ${contentId}` })
      setMediaForm(initialMediaForm)
      setPosterFile(null)
      setMovieVideoFile(null)
      setEpisodes([initialEpisode()])
    } catch (error: any) {
      logAdminPageError('Error al crear contenido', error)
      setContentMsg({ type: 'error', text: error.response?.data?.message ?? error.message ?? 'Error al crear contenido.' })
    } finally {
      setCreatingContent(false)
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

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Crear contenido</h2>
            <p className={styles.cardSub}>
              Guarda metadata en catalogo y sube portada/videos al bucket privado.
            </p>
          </div>

          {contentMsg && (
            <div className={contentMsg.type === 'success' ? styles.successMsg : styles.errorMsg}>
              {contentMsg.text}
            </div>
          )}

          <div className={styles.contentForm}>
            <label className={styles.field}>
              Tipo
              <select
                value={mediaForm.type}
                onChange={(e) => setMediaForm((form) => ({ ...form, type: e.target.value as 'movie' | 'series' }))}
              >
                <option value="movie">Pelicula</option>
                <option value="series">Serie</option>
              </select>
            </label>

            <label className={styles.field}>
              Titulo
              <input
                value={mediaForm.title}
                onChange={(e) => setMediaForm((form) => ({ ...form, title: e.target.value }))}
              />
            </label>

            <label className={styles.field}>
              Fecha de estreno
              <input
                type="date"
                value={mediaForm.releaseDate}
                onChange={(e) => setMediaForm((form) => ({ ...form, releaseDate: e.target.value }))}
              />
            </label>

            <label className={styles.field}>
              Generos separados por coma
              <input
                value={mediaForm.genres}
                onChange={(e) => setMediaForm((form) => ({ ...form, genres: e.target.value }))}
                placeholder="Drama, Accion"
              />
            </label>

            <label className={`${styles.field} ${styles.fullWidth}`}>
              Descripcion
              <textarea
                rows={4}
                value={mediaForm.overview}
                onChange={(e) => setMediaForm((form) => ({ ...form, overview: e.target.value }))}
              />
            </label>

            <label className={`${styles.field} ${styles.fullWidth}`}>
              Reparto, uno por linea: Actor | Personaje
              <textarea
                rows={3}
                value={mediaForm.cast}
                onChange={(e) => setMediaForm((form) => ({ ...form, cast: e.target.value }))}
              />
            </label>

            <label className={styles.field}>
              Portada
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPosterFile(e.target.files?.[0] ?? null)}
              />
            </label>

            {mediaForm.type === 'movie' && (
              <label className={styles.field}>
                Video
                <input
                  type="file"
                  accept="video/mp4,video/webm"
                  onChange={(e) => setMovieVideoFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>

          {mediaForm.type === 'series' && (
            <div className={styles.episodesBox}>
              <div className={styles.episodesHeader}>
                <h3>Episodios</h3>
                <button className="btn btn-secondary" type="button" onClick={addEpisode}>
                  Agregar episodio
                </button>
              </div>

              {episodes.map((episode, index) => (
                <div key={index} className={styles.episodeCard}>
                  <label className={styles.field}>
                    Temporada
                    <input
                      type="number"
                      min="1"
                      value={episode.seasonNumber}
                      onChange={(e) => updateEpisode(index, { seasonNumber: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    Episodio
                    <input
                      type="number"
                      min="1"
                      value={episode.episodeNumber}
                      onChange={(e) => updateEpisode(index, { episodeNumber: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    Titulo
                    <input
                      value={episode.title}
                      onChange={(e) => updateEpisode(index, { title: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    Duracion min.
                    <input
                      type="number"
                      min="0"
                      value={episode.runtimeMinutes}
                      onChange={(e) => updateEpisode(index, { runtimeMinutes: e.target.value })}
                    />
                  </label>
                  <label className={`${styles.field} ${styles.fullWidth}`}>
                    Descripcion
                    <textarea
                      rows={2}
                      value={episode.overview}
                      onChange={(e) => updateEpisode(index, { overview: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    Video
                    <input
                      type="file"
                      accept="video/mp4,video/webm"
                      onChange={(e) => updateEpisode(index, { videoFile: e.target.files?.[0] ?? null })}
                    />
                  </label>
                  <div className={styles.episodeActions}>
                    <button className="btn btn-secondary" type="button" onClick={() => removeEpisode(index)}>
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={styles.createActions}>
            <button className="btn btn-primary" onClick={handleCreateContent} disabled={creatingContent}>
              {creatingContent ? <span className="spinner" /> : 'Crear y subir archivos'}
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
