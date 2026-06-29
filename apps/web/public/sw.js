/* 
  Quetxal TV  download Service Worker.
 */

const VIDEO_CACHE = 'quetxal-tv-video-cache-v1'
const OFFLINE_ROUTE_PREFIX = '/__qtv_offline_video__/'

function normalizeCacheKey(cacheKey) {
  if (!cacheKey || typeof cacheKey !== 'string') return ''
  try {
    return new URL(cacheKey, self.location.origin).toString()
  } catch (_) {
    return ''
  }
}

async function cacheTextFallback(cache, cacheKey, payload) {
  const body = JSON.stringify({
    ...payload,
    generated_at: new Date().toISOString(),
    mode: 'simulated-local-cache-fallback',
  })

  await cache.put(
    cacheKey,
    new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-quetxal-download-mode': 'simulated-local-cache-fallback',
      },
    }),
  )
}

async function cacheVideo({ videoUrl, cacheKey, title, contentId, episodeId, mimeType }) {
  const normalizedKey = normalizeCacheKey(cacheKey)
  if (!normalizedKey) {
    return { ok: false, status: 'failed', error: 'CACHE_KEY_INVALID' }
  }

  const cache = await caches.open(VIDEO_CACHE)

  if (!videoUrl || typeof videoUrl !== 'string') {
    await cacheTextFallback(cache, normalizedKey, {
      title,
      content_id: contentId,
      episode_id: episodeId,
      media_mime_type: mimeType || 'video/mp4',
      reason: 'VIDEO_URL_EMPTY',
    })
    return { ok: true, status: 'simulated_placeholder', cacheKey: normalizedKey }
  }

  try {
    const response = await fetch(videoUrl, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'reload',
    })

    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`)
    }

    await cache.put(normalizedKey, response.clone())
    return { ok: true, status: 'cached', cacheKey: normalizedKey }
  } catch (corsError) {
    try {
      const opaqueResponse = await fetch(videoUrl, {
        mode: 'no-cors',
        credentials: 'omit',
        cache: 'reload',
      })

      await cache.put(normalizedKey, opaqueResponse.clone())
      return { ok: true, status: 'cached_opaque', cacheKey: normalizedKey }
    } catch (opaqueError) {
      await cacheTextFallback(cache, normalizedKey, {
        title,
        content_id: contentId,
        episode_id: episodeId,
        media_url: videoUrl,
        media_mime_type: mimeType || 'video/mp4',
        reason: opaqueError instanceof Error ? opaqueError.message : 'CACHE_FETCH_FAILED',
      })

      return {
        ok: true,
        status: 'simulated_placeholder',
        cacheKey: normalizedKey,
        error: opaqueError instanceof Error ? opaqueError.message : 'CACHE_FETCH_FAILED',
      }
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type !== 'CACHE_VIDEO') return

  event.waitUntil((async () => {
    const result = await cacheVideo(data.payload || {})
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(result)
    }
  })())
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (!url.pathname.startsWith(OFFLINE_ROUTE_PREFIX)) return

  event.respondWith((async () => {
    const cached = await caches.match(event.request.url)
    if (cached) return cached

    return new Response('Offline download not found in Cache Storage', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  })())
})
