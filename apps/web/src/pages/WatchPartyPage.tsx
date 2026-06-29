import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppLayout from '../layouts/AppLayout'
import { catalogService, type ContentDetail } from '../services/catalog.service'
import { watchPartyService, type WatchPartyRoom } from '../services/watchParty.service'
import styles from './ContentDetailPage.module.css'

type WsMessage = {
  type: 'snapshot' | 'presence' | 'sync' | 'error'
  message?: string
  is_host?: boolean
  room?: WatchPartyRoom
  playback?: WatchPartyRoom['playback']
}

type PlaybackAction = 'play' | 'pause' | 'seek'

function getExpectedPosition(playback: WatchPartyRoom['playback']) {
  const basePosition = Number(playback.position || 0)
  if (playback.action !== 'play') return basePosition

  const updatedAt = Date.parse(playback.updated_at || '')
  if (Number.isNaN(updatedAt)) return basePosition

  const elapsedSeconds = Math.max(0, (Date.now() - updatedAt) / 1000)
  return basePosition + elapsedSeconds
}

export default function WatchPartyPage() {
  const { code = '' } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const isHostRef = useRef(false)
  const applyingRemoteRef = useRef(false)
  const remoteTimerRef = useRef<number | null>(null)
  const pendingPlaybackRef = useRef<WatchPartyRoom['playback'] | null>(null)
  const lastSentRef = useRef<{ action: PlaybackAction; position: number; at: number } | null>(null)

  const [room, setRoom] = useState<WatchPartyRoom | null>(null)
  const [detail, setDetail] = useState<ContentDetail | null>(null)
  const [isHost, setIsHostState] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const [syncWarning, setSyncWarning] = useState('')
  const [playbackUnlocked, setPlaybackUnlocked] = useState(false)
  const [parentalPin, setParentalPin] = useState('')
  const [parentalReason, setParentalReason] = useState('')
  const [unlockAttempt, setUnlockAttempt] = useState(0)

  const setHost = useCallback((value: boolean) => {
    isHostRef.current = value
    setIsHostState(value)
    if (value) setPlaybackUnlocked(true)
  }, [])

  const wsUrl = useMemo(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const query = parentalPin ? `?parental_pin=${encodeURIComponent(parentalPin)}` : ''
    return `${protocol}//${window.location.host}/api/watch-party/ws/${code}${query}`
  }, [code, parentalPin])

  const releaseRemoteLock = useCallback(() => {
    if (remoteTimerRef.current) {
      window.clearTimeout(remoteTimerRef.current)
    }

    remoteTimerRef.current = window.setTimeout(() => {
      applyingRemoteRef.current = false
    }, 450)
  }, [])

  const applyPlayback = useCallback((playback: WatchPartyRoom['playback']) => {
    const video = videoRef.current
    if (!video) {
      pendingPlaybackRef.current = playback
      return
    }

    pendingPlaybackRef.current = null
    applyingRemoteRef.current = true

    const targetPosition = getExpectedPosition(playback)
    if (Number.isFinite(targetPosition) && Math.abs(video.currentTime - targetPosition) > 0.5) {
      video.currentTime = targetPosition
    }

    if (playback.action === 'play') {
      video.play()
        .then(() => {
          setPlaybackUnlocked(true)
          setSyncWarning('')
        })
        .catch(() => {
          setSyncWarning('Haz clic en "Activar sincronización" para permitir la reproducción sincronizada en este navegador.')
        })
        .finally(releaseRemoteLock)
      return
    }

    video.pause()
    setSyncWarning('')
    releaseRemoteLock()
  }, [releaseRemoteLock])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const roomRes = await watchPartyService.getRoom(code, parentalPin)
        if (cancelled) return
        setRoom(roomRes.data.room)
        setHost(roomRes.data.is_host)
        setParentalReason('')

        const detailRes = await catalogService.detail(roomRes.data.room.content_id, parentalPin)
        if (!cancelled) setDetail(detailRes.data)
      } catch (err: any) {
        const code = err?.response?.data?.code
        if (code === 'PARENTAL_PIN_REQUIRED') {
          setParentalReason(err?.response?.data?.message || 'Este contenido requiere PIN parental para unirte a la Watch Party.')
          return
        }

        setError(code === 'ACTIVE_SUBSCRIPTION_REQUIRED'
          ? 'Necesitas una suscripción activa para unirte a la Watch Party.'
          : 'No se pudo abrir la Watch Party.')
      }
    }

    load()
    return () => { cancelled = true }
  }, [code, setHost, unlockAttempt])

  useEffect(() => {
    if (!room) return

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setError('Se perdió la conexión de Watch Party.')
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as WsMessage
      if (message.type === 'error') {
        setError(message.message || 'Error de Watch Party')
        return
      }

      if (message.room) setRoom(message.room)

      const nextIsHost = typeof message.is_host === 'boolean' ? message.is_host : isHostRef.current
      if (typeof message.is_host === 'boolean') setHost(message.is_host)

      const playback = message.playback || message.room?.playback
      if ((message.type === 'snapshot' || message.type === 'sync') && playback && !nextIsHost) {
        applyPlayback(playback)
      }
    }

    return () => {
      ws.close()
      if (remoteTimerRef.current) window.clearTimeout(remoteTimerRef.current)
    }
  }, [room?.code, wsUrl, applyPlayback, setHost])

  useEffect(() => {
    if (detail?.content && pendingPlaybackRef.current && !isHostRef.current) {
      applyPlayback(pendingPlaybackRef.current)
    }
  }, [detail?.content, applyPlayback])

  const sendControl = useCallback((action: PlaybackAction) => {
    const video = videoRef.current
    if (!isHostRef.current || !video || wsRef.current?.readyState !== WebSocket.OPEN) return
    if (applyingRemoteRef.current) return

    const position = video.currentTime
    const now = Date.now()
    const lastSent = lastSentRef.current

    if (
      lastSent &&
      lastSent.action === action &&
      Math.abs(lastSent.position - position) < 0.25 &&
      now - lastSent.at < 350
    ) {
      return
    }

    lastSentRef.current = { action, position, at: now }
    wsRef.current.send(JSON.stringify({
      type: 'control',
      action,
      position,
    }))
  }, [])

  const sendCurrentPlaybackState = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    sendControl(video.paused ? 'pause' : 'play')
  }, [sendControl])

  const unlockPlayback = useCallback(async () => {
    const video = videoRef.current
    if (!video) return

    setSyncWarning('')
    setPlaybackUnlocked(true)

    try {
      await video.play()
      if ((room?.playback.action || 'pause') !== 'play') {
        video.pause()
      }
    } catch {
      setSyncWarning('El navegador todavía no permitió la reproducción. Intenta presionar Play una vez sobre el video.')
    }

    const playback = pendingPlaybackRef.current || room?.playback
    if (playback && !isHostRef.current) {
      applyPlayback(playback)
    }
  }, [applyPlayback, room?.playback])

  if (parentalReason && !room) {
    return (
      <AppLayout>
        <div className={styles.error}>
          <p>{parentalReason}</p>
          <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <input
              className="input"
              placeholder="PIN de 4 dígitos"
              value={parentalPin}
              maxLength={4}
              inputMode="numeric"
              onChange={(e) => setParentalPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            <button
              className="btn btn-primary"
              onClick={() => setUnlockAttempt((value) => value + 1)}
              disabled={!/^\d{4}$/.test(parentalPin)}
            >
              Desbloquear Watch Party
            </button>
          </div>
          <button className="btn btn-secondary" onClick={() => navigate('/catalog')}>Volver al catálogo</button>
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout>
        <div className={styles.error}>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate(error.includes('suscripción') ? '/subscriptions' : '/catalog')}>
            {error.includes('suscripción') ? 'Ver planes' : 'Volver al catálogo'}
          </button>
        </div>
      </AppLayout>
    )
  }

  if (!room || !detail?.content) {
    return <AppLayout><div className={styles.loading}>Cargando Watch Party...</div></AppLayout>
  }

  return (
    <AppLayout>
      <div className={styles.hero}>
        <div className="container">
          <h1 className={styles.title}>Watch Party: {detail.content.title}</h1>
          <p className={styles.meta}>
            Código {room.code} · {room.participants_count} participante(s) · {connected ? 'Conectado' : 'Conectando'}
          </p>
          <p>Comparte este enlace: <strong>{window.location.href}</strong></p>
          {!isHost && <p>El anfitrión Premium controla la reproducción sincronizada.</p>}
          {!isHost && !playbackUnlocked && (
            <button className="btn btn-primary" type="button" onClick={unlockPlayback}>
              Activar sincronización
            </button>
          )}
          {syncWarning && <p className={styles.meta}>{syncWarning}</p>}
        </div>
      </div>

      <div className={styles.playerSection}>
        <div className="container">
          <div className={styles.videoWrapper}>
            <video
              ref={videoRef}
              controls={isHost}
              preload="metadata"
              playsInline
              onPlay={() => sendControl('play')}
              onPause={() => {
                if (!videoRef.current?.seeking) sendControl('pause')
              }}
              onSeeked={sendCurrentPlaybackState}
            >
              <source src={detail.content.media_url} type="video/mp4" />
              Tu navegador no soporta reproducción de video.
            </video>
          </div>
          {!isHost && (
            <p className={styles.meta}>
              Como invitado, la reproducción la controla el anfitrión. Usa el botón de activación si el navegador bloquea el inicio automático.
            </p>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
