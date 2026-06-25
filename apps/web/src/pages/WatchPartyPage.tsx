import { useEffect, useMemo, useRef, useState } from 'react'
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

export default function WatchPartyPage() {
  const { code = '' } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const [room, setRoom] = useState<WatchPartyRoom | null>(null)
  const [detail, setDetail] = useState<ContentDetail | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)

  const wsUrl = useMemo(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/api/watch-party/ws/${code}`
  }, [code])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const roomRes = await watchPartyService.getRoom(code)
        if (cancelled) return
        setRoom(roomRes.data.room)
        setIsHost(roomRes.data.is_host)

        const detailRes = await catalogService.detail(roomRes.data.room.content_id)
        if (!cancelled) setDetail(detailRes.data)
      } catch (err: any) {
        const code = err?.response?.data?.code
        setError(code === 'ACTIVE_SUBSCRIPTION_REQUIRED'
          ? 'Necesitas una suscripción activa para unirte a la Watch Party.'
          : 'No se pudo abrir la Watch Party.')
      }
    }

    load()
    return () => { cancelled = true }
  }, [code])

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
      if (typeof message.is_host === 'boolean') setIsHost(message.is_host)

      if (message.type === 'sync' && message.playback && videoRef.current) {
        const video = videoRef.current
        if (Math.abs(video.currentTime - message.playback.position) > 1) {
          video.currentTime = message.playback.position
        }
        if (message.playback.action === 'play') video.play().catch(() => {})
        if (message.playback.action === 'pause') video.pause()
        if (message.playback.action === 'seek') video.currentTime = message.playback.position
      }
    }

    return () => ws.close()
  }, [room?.code, wsUrl])

  const sendControl = (action: 'play' | 'pause' | 'seek') => {
    if (!isHost || !videoRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({
      type: 'control',
      action,
      position: videoRef.current.currentTime,
    }))
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
        </div>
      </div>

      <div className={styles.playerSection}>
        <div className="container">
          <div className={styles.videoWrapper}>
            <video
              ref={videoRef}
              controls
              preload="metadata"
              onPlay={() => sendControl('play')}
              onPause={() => sendControl('pause')}
              onSeeked={() => sendControl('seek')}
            >
              <source src={detail.content.media_url} type="video/mp4" />
              Tu navegador no soporta reproducción de video.
            </video>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
