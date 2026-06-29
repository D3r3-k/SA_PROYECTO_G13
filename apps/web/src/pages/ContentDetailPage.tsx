import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppLayout from '../layouts/AppLayout'
import { useAuth } from '../hooks/useAuth'
import { catalogService, type ContentDetail, type Episode } from '../services/catalog.service'
import { engagementService, type RatingSummary, type ResumeResponse } from '../services/engagement.service'
import { watchPartyService } from '../services/watchParty.service'
import { downloadService } from '../services/download.service'
import { saveEncryptedDownload } from '../services/offlineDownloads.service'
import styles from './ContentDetailPage.module.css'

type UserRating = 'THUMBS_UP' | 'THUMBS_DOWN' | null

export default function ContentDetailPage() {
  const { contentId } = useParams<{ contentId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [detail, setDetail] = useState<ContentDetail | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(null)
  const [resume, setResume] = useState<ResumeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [parentalPin, setParentalPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [watchPartyError, setWatchPartyError] = useState('')
  const [creatingParty, setCreatingParty] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const [downloadStatus, setDownloadStatus] = useState('')
  const [downloading, setDownloading] = useState(false)

  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null)
  const [userRating, setUserRating] = useState<UserRating>(null)
  const [videoDuration, setVideoDuration] = useState<number | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const lastSavedMinute = useRef(-1)
  const pendingSaveMinute = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadContent = useCallback(async (pin = '') => {
    if (!contentId) return
    setLoading(true)
    setError('')
    setPinError('')

    const profileId = user?.profile_id ?? ''

    try {
      const [detailRes, ratingRes, resumeRes] = await Promise.all([
        catalogService.detail(contentId, pin),
        engagementService.getRatingSummary(contentId).catch((error) => {
          console.error(`[ContentDetailPage.tsx] Error: ${error instanceof Error ? error.message : String(error)}`)
          return null
        }),
        profileId ? engagementService.resume(contentId, profileId).catch((error) => {
          console.error(`[ContentDetailPage.tsx] Error: ${error instanceof Error ? error.message : String(error)}`)
          return null
        }) : Promise.resolve(null),
      ])

      const d = detailRes.data
      setDetail(d)
      if (ratingRes) setRatingSummary(ratingRes.data)
      if (resumeRes?.data?.found) setResume(resumeRes.data)

      if (d.content.type === 'series') {
        const epRes = await catalogService.episodes(contentId, 1, pin)
        const eps = epRes.data.episodes ?? []
        setEpisodes(eps)
        if (eps.length > 0) {
          if (resumeRes?.data?.found && resumeRes.data.episode_number > 0) {
            const resumeEp = eps.find(
              (e) =>
                e.season_number === resumeRes.data.season_number &&
                e.episode_number === resumeRes.data.episode_number,
            )
            setSelectedEpisode(resumeEp ?? eps[0])
          } else {
            setSelectedEpisode(eps[0])
          }
        }
      }
    } catch (err: any) {
      console.error(`[ContentDetailPage.tsx] Error: ${err instanceof Error ? err.message : String(err)}`)
      const code = err?.response?.data?.code
      setError(code === 'ACTIVE_SUBSCRIPTION_REQUIRED'
        ? 'Necesitas una suscripción activa para reproducir contenido.'
        : 'No se pudo cargar el contenido. El servicio puede no estar disponible.')
    } finally {
      setLoading(false)
    }
  }, [contentId, user])

  useEffect(() => {
    loadContent()
  }, [loadContent])

  const currentVideoUrl = detail?.content.type === 'series'
    ? selectedEpisode?.media_url ?? ''
    : detail?.content.media_url ?? ''

  const parentalBlocked = Boolean(detail?.parental_control?.blocked)

  const handleUnlock = async () => {
    if (!/^\d{4}$/.test(parentalPin)) {
      setPinError('Ingresa un PIN de 4 dígitos.')
      return
    }

    await loadContent(parentalPin)
  }

  const handleCreateWatchParty = async () => {
    if (!contentId || creatingParty) return
    setCreatingParty(true)
    setWatchPartyError('')
    try {
      const res = await watchPartyService.createRoom(contentId, parentalPin)
      navigate(`/watch-party/${res.data.code}`)
    } catch (err: any) {
      console.error(`[ContentDetailPage.tsx] Error: ${err instanceof Error ? err.message : String(err)}`)
      const code = err?.response?.data?.code
      setWatchPartyError(code === 'PREMIUM_PLAN_REQUIRED'
        ? 'Solo usuarios Premium pueden crear una Watch Party.'
        : code === 'PARENTAL_PIN_REQUIRED'
          ? 'Ingresa el PIN parental antes de crear la Watch Party.'
          : 'No se pudo crear la Watch Party.')
    } finally {
      setCreatingParty(false)
    }
  }

  const handleDownload = async () => {
    if (!contentId || downloading) return
    setDownloadError('')
    setDownloadStatus('')
    setDownloading(true)

    try {
      const response = isSeries && selectedEpisode
        ? await downloadService.requestEpisodeDownload(
            contentId,
            selectedEpisode.episode_id,
            selectedEpisode.season_number,
            parentalPin,
          )
        : await downloadService.requestMovieDownload(contentId, parentalPin)

      const record = await saveEncryptedDownload(response.data.grant)
      const readyMessage = record.cache_status === 'cached' || record.cache_status === 'cached_opaque'
        ? 'Ya puedes abrirlo desde Mis descargas.'
        : 'Quedó agregado a tus descargas en este navegador.'
      setDownloadStatus(`${record.title} se guardó correctamente. ${readyMessage}`)
    } catch (err: any) {
      console.error(`[ContentDetailPage.tsx] Error: ${err instanceof Error ? err.message : String(err)}`)
      const code = err?.response?.data?.code
      setDownloadError(code === 'STANDARD_PLAN_REQUIRED'
        ? 'La descarga solo está disponible para Plan Estándar. Básico y Premium están bloqueados por la regla del proyecto.'
        : code === 'PARENTAL_PIN_REQUIRED'
          ? 'Ingresa el PIN parental correcto antes de descargar.'
          : code === 'DOWNLOAD_MEDIA_NOT_AVAILABLE'
            ? 'Este contenido no tiene video disponible para descarga.'
            : code === 'EPISODE_DOWNLOAD_REQUIRED'
              ? 'Selecciona un episodio para descargar la serie.'
              : err?.message || 'No se pudo guardar la descarga.')
    } finally {
      setDownloading(false)
    }
  }

  const handleVideoLoaded = useCallback(() => {
    if (!videoRef.current) return
    const dur = videoRef.current.duration
    if (dur && isFinite(dur)) setVideoDuration(dur)
    if (!resume?.found) return
    const seekTo = resume.minute * 60
    if (seekTo > 0 && seekTo < dur) {
      videoRef.current.currentTime = seekTo
    }
  }, [resume])

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video || !contentId || !user) return
    const currentMinute = Math.floor(video.currentTime / 60)
    if (currentMinute <= 0 || currentMinute === lastSavedMinute.current) return
    lastSavedMinute.current = currentMinute

    if (pendingSaveMinute.current) clearTimeout(pendingSaveMinute.current)
    pendingSaveMinute.current = setTimeout(() => {
      engagementService
        .saveProgress(
          contentId,
          user.profile_id,
          currentMinute,
          selectedEpisode?.season_number ?? 0,
          selectedEpisode?.episode_number ?? 0,
        )
        .catch((error) => {
          console.error(`[ContentDetailPage.tsx] Error: ${error instanceof Error ? error.message : String(error)}`)
        })
    }, 500)
  }, [contentId, user, selectedEpisode])

  const handleRate = async (rating: 'THUMBS_UP' | 'THUMBS_DOWN') => {
    if (!contentId || !user) return
    const next = userRating === rating ? null : rating
    setUserRating(next)
    if (next) {
      await engagementService.rate(contentId, user.profile_id, next).catch((error) => {
        console.error(`[ContentDetailPage.tsx] Error: ${error instanceof Error ? error.message : String(error)}`)
      })
      const fresh = await engagementService.getRatingSummary(contentId).catch((error) => {
        console.error(`[ContentDetailPage.tsx] Error: ${error instanceof Error ? error.message : String(error)}`)
        return null
      })
      if (fresh) setRatingSummary(fresh.data)
    }
  }

  const handleSelectEpisode = (ep: Episode) => {
    setSelectedEpisode(ep)
    lastSavedMinute.current = -1
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch((error) => {
        console.error(`[ContentDetailPage.tsx] Error: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className={styles.loading}>Cargando contenido...</div>
      </AppLayout>
    )
  }

  if (error || !detail?.content) {
    return (
      <AppLayout>
        <div className={styles.error}>
          <p>{error || 'Contenido no encontrado.'}</p>
          <button className="btn btn-primary" onClick={() => navigate(error.includes('suscripción') ? '/subscriptions' : '/catalog')}>
            {error.includes('suscripción') ? 'Ver planes' : 'Volver al catálogo'}
          </button>
        </div>
      </AppLayout>
    )
  }

  const formatVideoDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  const { content, cast, seasons_count, episodes_count } = detail
  const isSeries = content.type === 'series'
  const year = content.release_date ? new Date(content.release_date).getFullYear() : null
  const pct = ratingSummary ? Math.round(ratingSummary.recommendation_percentage) : null

  return (
    <AppLayout>
      <div className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <div className={styles.poster}>
              {content.poster_path ? (
                <img src={content.poster_path} alt={content.title} />
              ) : (
                <div className={styles.posterPlaceholder}>{isSeries ? '📺' : '🎬'}</div>
              )}
            </div>

            <div className={styles.info}>
              <div className={styles.typeBadge}>
                <span className="badge badge-info">{isSeries ? 'Serie' : 'Película'}</span>
                <span className="badge badge-info" style={{ marginLeft: '.5rem' }}>{content.maturity_rating || 'ALL'}</span>
              </div>

              <h1 className={styles.title}>{content.title}</h1>

              <p className={styles.meta}>
                {[
                  year,
                  isSeries && seasons_count > 0 ? `${seasons_count} temporada${seasons_count > 1 ? 's' : ''}` : null,
                  isSeries && episodes_count > 0 ? `${episodes_count} episodio${episodes_count > 1 ? 's' : ''}` : null,
                ].filter(Boolean).join(' · ')}
              </p>

              {content.genres?.length > 0 && (
                <div className={styles.genres}>
                  {content.genres.map((g) => <span key={g.name} className={styles.genreTag}>{g.name}</span>)}
                </div>
              )}

              {content.overview && <p className={styles.overview}>{content.overview}</p>}

              <div className={styles.actions}>
                {pct !== null && (
                  <div className={styles.ratingInfo}>
                    <span className={styles.ratingPct}>{pct}%</span>
                    <span>recomendado</span>
                    {ratingSummary && ratingSummary.total_ratings > 0 && <span>({ratingSummary.total_ratings} votos)</span>}
                  </div>
                )}

                <button className="btn btn-primary btn-sm" onClick={handleCreateWatchParty} disabled={creatingParty}>
                  {creatingParty ? 'Creando...' : 'Crear Watch Party'}
                </button>
                {watchPartyError && <span style={{ color: 'var(--color-danger)' }}>{watchPartyError}</span>}

                <button className="btn btn-secondary btn-sm" onClick={handleDownload} disabled={downloading || (isSeries && !selectedEpisode)}>
                  {downloading ? 'Guardando...' : isSeries ? 'Descargar episodio' : 'Descargar'}
                </button>
                {downloadError && <span style={{ color: 'var(--color-danger)' }}>{downloadError}</span>}
                {downloadStatus && <span style={{ color: 'var(--color-success)' }}>{downloadStatus}</span>}

                <div className={styles.ratingButtons}>
                  <button className={`${styles.ratingBtn} ${userRating === 'THUMBS_UP' ? styles.ratingBtnActive : ''}`} onClick={() => handleRate('THUMBS_UP')} title="Me gusta">👍</button>
                  <button className={`${styles.ratingBtn} ${userRating === 'THUMBS_DOWN' ? styles.ratingBtnActive : ''}`} onClick={() => handleRate('THUMBS_DOWN')} title="No me gusta">👎</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.playerSection}>
        <div className="container">
          {parentalBlocked ? (
            <div className={styles.noVideo}>
              <p>{detail.parental_control?.reason || 'Este contenido requiere PIN parental.'}</p>
              <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', marginTop: '1rem' }}>
                <input
                  className="input"
                  placeholder="PIN de 4 dígitos"
                  value={parentalPin}
                  maxLength={4}
                  inputMode="numeric"
                  onChange={(e) => setParentalPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
                <button className="btn btn-primary" onClick={handleUnlock}>Desbloquear</button>
              </div>
              {pinError && <p style={{ color: 'var(--color-danger)' }}>{pinError}</p>}
            </div>
          ) : (
            <>
              {resume?.found && !isSeries && <div className={styles.resumeBanner}><span>Continuando desde el minuto {resume.minute}</span></div>}

              {isSeries && selectedEpisode && <p className={styles.playerTitle}>T{selectedEpisode.season_number} E{selectedEpisode.episode_number} — {selectedEpisode.title}</p>}

              {videoDuration !== null && <p className={styles.videoDuration}>Duración real: {formatVideoDuration(videoDuration)}</p>}

              {currentVideoUrl ? (
                <div className={styles.videoWrapper}>
                  <video ref={videoRef} key={currentVideoUrl} controls preload="metadata" onLoadedMetadata={handleVideoLoaded} onTimeUpdate={handleTimeUpdate}>
                    <source src={currentVideoUrl} type="video/mp4" />
                    Tu navegador no soporta reproducción de video.
                  </video>
                </div>
              ) : (
                <div className={styles.noVideo}>No hay video disponible para este contenido.</div>
              )}
            </>
          )}
        </div>
      </div>

      {isSeries && episodes.length > 0 && (
        <div className={styles.episodesSection}>
          <div className="container">
            <h2 className={styles.sectionTitle}>Episodios</h2>
            <div className={styles.episodeList}>
              {episodes.map((ep) => (
                <button key={ep.episode_id} className={`${styles.episodeItem} ${selectedEpisode?.episode_id === ep.episode_id ? styles.episodeItemActive : ''}`} onClick={() => handleSelectEpisode(ep)}>
                  <span className={styles.episodeNum}>{ep.episode_number}</span>
                  <div className={styles.episodeInfo}>
                    <p className={styles.episodeName}>{ep.title || `Episodio ${ep.episode_number}`}</p>
                    {ep.runtime_minutes > 0 && <p className={styles.episodeRuntime}>{ep.runtime_minutes} min</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {cast?.length > 0 && (
        <div className={styles.castSection}>
          <div className="container">
            <h2 className={styles.sectionTitle}>Reparto</h2>
            <div className={styles.castGrid}>
              {cast.map((member, i) => (
                <div key={i} className={styles.castCard}>
                  <p className={styles.castActor}>{member.actor_name}</p>
                  {member.character_name && <p className={styles.castCharacter}>{member.character_name}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
