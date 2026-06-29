const SERVICE_WORKER_URL = '/sw.js'

export type VideoCacheStatus =
  | 'cached'
  | 'cached_opaque'
  | 'simulated_placeholder'
  | 'unsupported'
  | 'failed'

export interface CacheVideoPayload {
  videoUrl: string
  cacheKey: string
  title: string
  contentId: string
  episodeId?: string
  mimeType?: string
}

export interface CacheVideoResult {
  ok: boolean
  status: VideoCacheStatus
  cacheKey?: string
  error?: string
}

function canUseServiceWorker(): boolean {
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  return 'serviceWorker' in navigator && (window.isSecureContext || isLocalhost)
}

export async function registerDownloadServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!canUseServiceWorker()) return null

  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' })

  if (!navigator.serviceWorker.controller) {
    await navigator.serviceWorker.ready
  }

  return registration
}

async function waitForActiveWorker(registration: ServiceWorkerRegistration): Promise<ServiceWorker> {
  if (registration.active) return registration.active
  if (registration.waiting) return registration.waiting
  if (registration.installing) {
    return new Promise((resolve, reject) => {
      const worker = registration.installing
      if (!worker) return reject(new Error('No se pudo activar el Service Worker'))
      const timeout = window.setTimeout(() => reject(new Error('Tiempo de espera agotado activando Service Worker')), 8000)
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') {
          window.clearTimeout(timeout)
          resolve(worker)
        }
      })
    })
  }
  throw new Error('Service Worker no activo')
}

export async function cacheVideoWithServiceWorker(payload: CacheVideoPayload): Promise<CacheVideoResult> {
  if (!canUseServiceWorker()) {
    return { ok: false, status: 'unsupported', error: 'SERVICE_WORKER_UNSUPPORTED' }
  }

  try {
    const registration = await registerDownloadServiceWorker()
    if (!registration) {
      return { ok: false, status: 'unsupported', error: 'SERVICE_WORKER_UNSUPPORTED' }
    }

    const worker = await waitForActiveWorker(registration)

    return await new Promise<CacheVideoResult>((resolve) => {
      const channel = new MessageChannel()
      const timeout = window.setTimeout(() => {
        resolve({ ok: false, status: 'failed', error: 'SERVICE_WORKER_CACHE_TIMEOUT' })
      }, 20000)

      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout)
        resolve(event.data as CacheVideoResult)
      }

      worker.postMessage({ type: 'CACHE_VIDEO', payload }, [channel.port2])
    })
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      error: error instanceof Error ? error.message : 'SERVICE_WORKER_CACHE_FAILED',
    }
  }
}
