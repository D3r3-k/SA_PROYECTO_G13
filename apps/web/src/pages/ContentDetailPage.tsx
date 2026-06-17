import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppLayout from '../layouts/AppLayout'
import { useAuth } from '../hooks/useAuth'
import { catalogService, type ContentDetail, type Episode } from '../services/catalog.service'
import { engagementService, type RatingSummary, type ResumeResponse } from '../services/engagement.service'
import styles from './ContentDetailPage.module.css'

type UserRating = 'THUMBS_UP' | 'THUMBS_DOWN' | null

export default function ContentDetailPage() {
  const { contentId } = useParams<{ contentId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [detail, setDetail]       = useState<ContentDetail | null>(null)
  const [episodes, setEpisodes]   = useState<Episode[]>([])
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(null)
  const [resume, setResume]       = useState<ResumeResponse | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null)
  const [userRating, setUserRating] = useState<UserRating>(null)

  const videoRef          = useRef<HTMLVideoElement>(null)
  const lastSavedMinute   = useRef(-1)
  const pendingSaveMinute = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!contentId) return

    const profileId = user?.profile_id ?? ''

    Promise.all([
      catalogService.detail(contentId),
      engagementService.getRatingSummary(contentId).catch(() => null),
      profileId ? engagementService.resume(contentId, profileId).catch(() => null) : Promise.resolve(null),
    ])
      .then(([detailRes, ratingRes, resumeRes]) => {
        const d = detailRes.data
        setDetail(d)
        if (ratingRes) setRatingSummary(ratingRes.data)
        if (resumeRes?.data?.found) setResume(resumeRes.data)

        if (d.content.type === 'series') {
          return catalogService.episodes(contentId, 1).then((epRes) => {
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
          })
        }
      })
      .catch(() => setError('No se pudo cargar el contenido. El servicio puede no estar disponible.'))
      .finally(() => setLoading(false))
  }, [contentId, user])

  const currentVideoUrl = detail?.content.type === 'series'
    ? selectedEpisode?.media_url ?? ''
    : detail?.content.media_url ?? ''

  const handleVideoLoaded = useCallback(() => {
    if (!resume?.found || !videoRef.current) return
    const seekTo = resume.minute * 60
    if (seekTo > 0 && seekTo < videoRef.current.duration) {
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
        .catch(() => {})
    }, 500)
  }, [contentId, user, selectedEpisode])

  const handleRate = async (rating: 'THUMBS_UP' | 'THUMBS_DOWN') => {
    if (!contentId || !user) return
    const next = userRating === rating ? null : rating
    setUserRating(next)
    if (next) {
      await engagementService.rate(contentId, user.profile_id, next).catch(() => {})
      const fresh = await engagementService.getRatingSummary(contentId).catch(() => null)
      if (fresh) setRatingSummary(fresh.data)
    }
  }

  const handleSelectEpisode = (ep: Episode) => {
    setSelectedEpisode(ep)
    lastSavedMinute.current = -1
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
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
          <button className="btn btn-primary" onClick={() => navigate('/catalog')}>
            Volver al catálogo
          </button>
        </div>
      </AppLayout>
    )
  }

  const { content, cast, seasons_count, episodes_count } = detail
  const isSeries = content.type === 'series'
  const year = content.release_date ? new Date(content.release_date).getFullYear() : null
  const pct = ratingSummary
    ? Math.round(ratingSummary.recommendation_percentage)
    : null

  return (
    <AppLayout>
      {/* ── Hero ── */}
      <div className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <div className={styles.poster}>
              {content.poster_path ? (
                <img src={content.poster_path} alt={content.title} />
              ) : (
                <div className={styles.posterPlaceholder}>
                  {isSeries ? '📺' : '🎬'}
                </div>
              )}
            </div>

            <div className={styles.info}>
              <div className={styles.typeBadge}>
                <span className="badge badge-info">
                  {isSeries ? 'Serie' : 'Película'}
                </span>
              </div>

              <h1 className={styles.title}>{content.title}</h1>

              <p className={styles.meta}>
                {[
                  year,
                  isSeries && seasons_count > 0 ? `${seasons_count} temporada${seasons_count > 1 ? 's' : ''}` : null,
                  isSeries && episodes_count > 0 ? `${episodes_count} episodio${episodes_count > 1 ? 's' : ''}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>

              {content.genres?.length > 0 && (
                <div className={styles.genres}>
                  {content.genres.map((g) => (
                    <span key={g.name} className={styles.genreTag}>{g.name}</span>
                  ))}
                </div>
              )}

              {content.overview && (
                <p className={styles.overview}>{content.overview}</p>
              )}

              <div className={styles.actions}>
                {pct !== null && (
                  <div className={styles.ratingInfo}>
                    <span className={styles.ratingPct}>{pct}%</span>
                    <span>recomendado</span>
                    {ratingSummary && ratingSummary.total_ratings > 0 && (
                      <span>({ratingSummary.total_ratings} votos)</span>
                    )}
                  </div>
                )}

                <div className={styles.ratingButtons}>
                  <button
                    className={`${styles.ratingBtn} ${userRating === 'THUMBS_UP' ? styles.ratingBtnActive : ''}`}
                    onClick={() => handleRate('THUMBS_UP')}
                    title="Me gusta"
                  >
                    👍
                  </button>
                  <button
                    className={`${styles.ratingBtn} ${userRating === 'THUMBS_DOWN' ? styles.ratingBtnActive : ''}`}
                    onClick={() => handleRate('THUMBS_DOWN')}
                    title="No me gusta"
                  >
                    👎
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Player ── */}
      <div className={styles.playerSection}>
        <div className="container">
          {resume?.found && !isSeries && (
            <div className={styles.resumeBanner}>
              <span>Continuando desde el minuto {resume.minute}</span>
            </div>
          )}

          {isSeries && selectedEpisode && (
            <p className={styles.playerTitle}>
              T{selectedEpisode.season_number} E{selectedEpisode.episode_number} — {selectedEpisode.title}
            </p>
          )}

          {currentVideoUrl ? (
            <div className={styles.videoWrapper}>
              <video
                ref={videoRef}
                key={currentVideoUrl}
                controls
                preload="metadata"
                onLoadedMetadata={handleVideoLoaded}
                onTimeUpdate={handleTimeUpdate}
              >
                <source src={currentVideoUrl} type="video/mp4" />
                Tu navegador no soporta reproducción de video.
              </video>
            </div>
          ) : (
            <div className={styles.noVideo}>
              No hay video disponible para este contenido.
            </div>
          )}
        </div>
      </div>

      {/* ── Episodes (series) ── */}
      {isSeries && episodes.length > 0 && (
        <div className={styles.episodesSection}>
          <div className="container">
            <h2 className={styles.sectionTitle}>Episodios</h2>
            <div className={styles.episodeList}>
              {episodes.map((ep) => (
                <button
                  key={ep.episode_id}
                  className={`${styles.episodeItem} ${selectedEpisode?.episode_id === ep.episode_id ? styles.episodeItemActive : ''}`}
                  onClick={() => handleSelectEpisode(ep)}
                >
                  <span className={styles.episodeNum}>{ep.episode_number}</span>
                  <div className={styles.episodeInfo}>
                    <p className={styles.episodeName}>{ep.title || `Episodio ${ep.episode_number}`}</p>
                    {ep.runtime_minutes > 0 && (
                      <p className={styles.episodeRuntime}>{ep.runtime_minutes} min</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Cast ── */}
      {cast?.length > 0 && (
        <div className={styles.castSection}>
          <div className="container">
            <h2 className={styles.sectionTitle}>Reparto</h2>
            <div className={styles.castGrid}>
              {cast.map((member, i) => (
                <div key={i} className={styles.castCard}>
                  <p className={styles.castActor}>{member.actor_name}</p>
                  {member.character_name && (
                    <p className={styles.castCharacter}>{member.character_name}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
