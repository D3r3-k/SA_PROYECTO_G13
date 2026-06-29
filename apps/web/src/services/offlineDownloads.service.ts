import type { DownloadGrant } from './download.service'
import { cacheVideoWithServiceWorker, type VideoCacheStatus } from './serviceWorker.service'

const DB_NAME = 'quetxal_tv_downloads'
const STORE_NAME = 'encrypted_downloads'
const DB_VERSION = 2
const LOCAL_KEY = 'quetxal_download_crypto_key'
const OFFLINE_ROUTE_PREFIX = '/__qtv_offline_video__/'
const VIDEO_CACHE_NAME = 'quetxal-tv-video-cache-v1'

export interface OfflineDownloadRecord {
  id: string
  content_id: string
  episode_id: string
  title: string
  subtitle: string
  maturity_rating: string
  media_mime_type: string
  encrypted_payload: string
  iv: string
  cache_key: string
  cache_status: VideoCacheStatus
  download_mode: 'encrypted-indexeddb-and-service-worker-cache'
  created_at: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80)
}

function buildRecordId(grant: DownloadGrant): string {
  return `${grant.content_id}:${grant.episode?.episode_id ?? 'movie'}`
}

function buildCacheKey(grant: DownloadGrant): string {
  const title = slug(grant.title || 'contenido') || 'contenido'
  const episodeId = grant.episode?.episode_id ?? 'movie'
  const id = `${slug(grant.content_id)}-${slug(episodeId)}-${title}`
  return `${window.location.origin}${OFFLINE_ROUTE_PREFIX}${id}`
}

async function getOrCreateKey(): Promise<CryptoKey> {
  let rawKey = localStorage.getItem(LOCAL_KEY)

  if (!rawKey) {
    rawKey = bytesToBase64(randomBytes(32))
    localStorage.setItem(LOCAL_KEY, rawKey)
  }

  const bytes = base64ToBytes(rawKey)
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB'))
  })
}

function putRecord(db: IDBDatabase, record: OfflineDownloadRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('No se pudo guardar la descarga'))
  })
}


function deleteRecord(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('No se pudo eliminar la descarga'))
  })
}

async function deleteCachedVideo(cacheKey?: string): Promise<void> {
  if (!cacheKey || !('caches' in window)) return
  try {
    const cache = await caches.open(VIDEO_CACHE_NAME)
    await cache.delete(cacheKey)
  } catch (_) {
    // Si el navegador no permite limpiar Cache Storage, la descarga de IndexedDB igual se elimina.
  }
}

function getAllRecords(db: IDBDatabase): Promise<OfflineDownloadRecord[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve((request.result || []) as OfflineDownloadRecord[])
    request.onerror = () => reject(request.error ?? new Error('No se pudieron leer las descargas'))
  })
}

export async function saveEncryptedDownload(grant: DownloadGrant): Promise<OfflineDownloadRecord> {
  if (!window.crypto?.subtle || !window.indexedDB) {
    throw new Error('Este navegador no soporta almacenamiento cifrado para descargas')
  }

  const episode = grant.episode
  const cacheKey = buildCacheKey(grant)
  const subtitle = episode
    ? `T${episode.season_number} E${episode.episode_number} - ${episode.title}`
    : 'Película completa'

  const cacheResult = await cacheVideoWithServiceWorker({
    videoUrl: grant.media_url,
    cacheKey,
    title: grant.title,
    contentId: grant.content_id,
    episodeId: episode?.episode_id,
    mimeType: grant.media_mime_type || 'video/mp4',
  })

  const key = await getOrCreateKey()
  const iv = randomBytes(12)
  const payload = JSON.stringify({
    grant,
    stored_at: new Date().toISOString(),
    mode: 'encrypted-indexeddb-and-service-worker-cache',
    cache: {
      cache_key: cacheKey,
      cache_status: cacheResult.status,
      cache_error: cacheResult.error || '',
    },
  })

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(payload),
  )

  const record: OfflineDownloadRecord = {
    id: buildRecordId(grant),
    content_id: grant.content_id,
    episode_id: episode?.episode_id ?? '',
    title: grant.title,
    subtitle,
    maturity_rating: grant.maturity_rating,
    media_mime_type: grant.media_mime_type || 'video/mp4',
    encrypted_payload: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
    cache_key: cacheKey,
    cache_status: cacheResult.status,
    download_mode: 'encrypted-indexeddb-and-service-worker-cache',
    created_at: new Date().toISOString(),
  }

  const db = await openDb()
  try {
    await putRecord(db, record)
  } finally {
    db.close()
  }

  return record
}

export async function listOfflineDownloads(): Promise<OfflineDownloadRecord[]> {
  if (!window.indexedDB) return []
  const db = await openDb()
  try {
    const records = await getAllRecords(db)
    return records.sort((a, b) => b.created_at.localeCompare(a.created_at))
  } finally {
    db.close()
  }
}


export async function removeOfflineDownload(id: string, cacheKey?: string): Promise<void> {
  if (!window.indexedDB) return
  const db = await openDb()
  try {
    await deleteRecord(db, id)
  } finally {
    db.close()
  }
  await deleteCachedVideo(cacheKey)
}
