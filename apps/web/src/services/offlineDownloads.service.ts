import type { DownloadGrant } from './download.service'

const DB_NAME = 'quetxal_tv_downloads'
const STORE_NAME = 'encrypted_downloads'
const DB_VERSION = 1
const LOCAL_KEY = 'quetxal_download_crypto_key'

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

export async function saveEncryptedDownload(grant: DownloadGrant): Promise<OfflineDownloadRecord> {
  if (!window.crypto?.subtle || !window.indexedDB) {
    throw new Error('Este navegador no soporta almacenamiento cifrado para descargas')
  }

  const key = await getOrCreateKey()
  const iv = randomBytes(12)
  const payload = JSON.stringify({
    grant,
    stored_at: new Date().toISOString(),
    mode: 'simulated-encrypted-browser-storage',
  })

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(payload),
  )

  const episode = grant.episode
  const record: OfflineDownloadRecord = {
    id: `${grant.content_id}:${episode?.episode_id ?? 'movie'}`,
    content_id: grant.content_id,
    episode_id: episode?.episode_id ?? '',
    title: grant.title,
    subtitle: episode ? `T${episode.season_number} E${episode.episode_number} - ${episode.title}` : 'Película completa',
    maturity_rating: grant.maturity_rating,
    media_mime_type: grant.media_mime_type,
    encrypted_payload: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
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
