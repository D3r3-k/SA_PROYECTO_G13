import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  adminService,
  type AdminContentItem,
  type AdminContentStatus,
  type AuditFilters,
  type AuditLogItem,
  type AuditService,
  type ContentType,
  type CreatedEpisode,
  type EpisodeInput,
  type MediaType,
  type Plan,
} from '../services/admin.service'
import { catalogService, type Episode } from '../services/catalog.service'
import { getPlanFeatures, setPlanFeatures } from '../utils/planFeatures'
import styles from './AdminPage.module.css'

const DEFAULT_FEATURES: Record<string, string[]> = {
  básico: ['1 pantalla simultánea', 'Calidad HD', 'Sin descargas'],
  basic: ['1 pantalla simultánea', 'Calidad HD', 'Sin descargas'],
  estándar: ['2 pantallas simultáneas', 'Calidad Full HD', 'Descargas limitadas'],
  standard: ['2 pantallas simultáneas', 'Calidad Full HD', 'Descargas limitadas'],
  premium: ['4 pantallas simultáneas', 'Calidad 4K + HDR', 'Descargas ilimitadas'],
}

type Notice = { type: 'success' | 'error' | 'info'; text: string }
type PanelTab = 'catalog' | 'create' | 'edit' | 'audit' | 'plans'

interface PlanWithFeatures extends Plan {
  features: string[]
}

interface EditPlanForm {
  name: string
  price_usd: string
  features: string
}

interface EpisodeForm {
  seasonNumber: string
  episodeNumber: string
  title: string
  overview: string
  runtimeMinutes: string
  videoFile: File | null
  videoDurationLabel: string
}

interface ContentForm {
  type: ContentType
  title: string
  overview: string
  releaseDate: string
  availableFrom: string
  genres: string
  cast: string
}

interface MediaUploadState {
  contentId: string
  episodeId: string
  mediaType: MediaType
  file: File | null
  durationLabel: string
}

interface FeedbackModal {
  title: string
  text: string
  actionLabel?: string
  onAction?: () => void
}

const initialContentForm: ContentForm = {
  type: 'movie',
  title: '',
  overview: '',
  releaseDate: '',
  availableFrom: '',
  genres: '',
  cast: '',
}

const initialMediaUpload: MediaUploadState = {
  contentId: '',
  episodeId: '',
  mediaType: 'poster',
  file: null,
  durationLabel: '',
}

const newEpisode = (episodeNumber = 1): EpisodeForm => ({
  seasonNumber: '1',
  episodeNumber: String(episodeNumber),
  title: '',
  overview: '',
  runtimeMinutes: '',
  videoFile: null,
  videoDurationLabel: '',
})

function extractError(error: unknown, fallback: string) {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message
    ?? (error instanceof Error ? error.message : '')
    ?? fallback
  )
}

function parseCsv(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function parseCast(value: string) {
  return value
    .split('\n')
    .map((item, index) => {
      const [actorName, characterName = ''] = item.split('|').map((part) => part.trim())
      return { actorName, characterName, orderIndex: index }
    })
    .filter((item) => item.actorName)
}

function asInputDate(value: string) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10)
  return parsed.toISOString().slice(0, 10)
}

function asInputDateTime(value: string) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 16)
  const offset = parsed.getTimezoneOffset() * 60000
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16)
}

function toApiDateTime(value: string) {
  if (!value) return ''
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

function formatDate(value: string) {
  if (!value) return 'Sin fecha'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('es-GT', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusOf(content: AdminContentItem) {
  if (content.deleted_at) return 'Eliminado'
  if (content.available_from && new Date(content.available_from).getTime() > Date.now()) return 'Programado'
  return 'Visible'
}

function statusClass(content: AdminContentItem) {
  if (content.deleted_at) return styles.statusDeleted
  if (content.available_from && new Date(content.available_from).getTime() > Date.now()) return styles.statusScheduled
  return styles.statusVisible
}

function contentGenres(content: AdminContentItem) {
  return content.genres?.map((genre) => genre.name).filter(Boolean).join(', ') ?? ''
}

function serviceLabel(service: string) {
  const labels: Record<string, string> = {
    all: 'Todos',
    catalog: 'Catálogo',
    identity: 'Usuarios',
    subscription: 'Suscripciones',
    engagement: 'Actividad',
  }
  return labels[service] ?? service
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    INSERT: 'Creación',
    UPDATE: 'Actualización',
    DELETE: 'Eliminación',
  }
  return labels[action] ?? action
}

function mediaTypeLabel(type: MediaType) {
  if (type === 'poster') return 'Portada'
  if (type === 'movie_video') return 'Video de película'
  return 'Video de episodio'
}

function fileSizeLabel(file: File | null) {
  if (!file) return ''
  if (file.size < 1024 * 1024) return `${Math.max(1, Math.round(file.size / 1024))} KB`
  return `${(file.size / 1024 / 1024).toFixed(1)} MB`
}

function durationLabel(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const totalSeconds = Math.round(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours} h ${String(minutes).padStart(2, '0')} min`
  }

  if (minutes > 0) {
    return `${minutes} min ${String(remainingSeconds).padStart(2, '0')} s`
  }

  return `${remainingSeconds} s`
}

function minutesFromSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.max(1, Math.round(seconds / 60))
}

function getVideoDuration(file: File): Promise<{ seconds: number; minutes: number; label: string }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    const cleanup = () => URL.revokeObjectURL(url)

    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const seconds = video.duration
      cleanup()
      resolve({ seconds, minutes: minutesFromSeconds(seconds), label: durationLabel(seconds) })
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('No se pudo leer la duración del video.'))
    }
    video.src = url
  })
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function safeJson(value: string) {
  if (!value) return 'Sin datos'
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function compactJson(value: string) {
  if (!value) return 'Sin datos'
  try {
    const parsed = JSON.parse(value)
    const text = JSON.stringify(parsed)
    return text.length > 150 ? `${text.slice(0, 150)}...` : text
  } catch {
    return value.length > 150 ? `${value.slice(0, 150)}...` : value
  }
}

function readableChange(item: AuditLogItem) {
  if (item.action === 'INSERT') return compactJson(item.new_state_json)
  if (item.action === 'UPDATE') return compactJson(item.new_state_json || item.old_state_json)
  return compactJson(item.old_state_json || item.new_state_json)
}


export default function AdminPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [activeTab, setActiveTab] = useState<PanelTab>('catalog')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [feedbackModal, setFeedbackModal] = useState<FeedbackModal | null>(null)

  const [plans, setPlans] = useState<PlanWithFeatures[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null)
  const [editPlanForm, setEditPlanForm] = useState<EditPlanForm>({ name: '', price_usd: '', features: '' })
  const [savingPlan, setSavingPlan] = useState(false)


  const [contentItems, setContentItems] = useState<AdminContentItem[]>([])
  const [loadingContent, setLoadingContent] = useState(false)
  const [contentStatus, setContentStatus] = useState<AdminContentStatus>('all')
  const [contentType, setContentType] = useState<'all' | ContentType>('all')
  const [contentQuery, setContentQuery] = useState('')

  const [contentForm, setContentForm] = useState<ContentForm>(initialContentForm)
  const [episodes, setEpisodes] = useState<EpisodeForm[]>([newEpisode()])
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [movieVideoFile, setMovieVideoFile] = useState<File | null>(null)
  const [movieVideoDurationLabel, setMovieVideoDurationLabel] = useState('')
  const [savingContent, setSavingContent] = useState(false)
  const [editingContentId, setEditingContentId] = useState<string | null>(null)

  const [mediaUpload, setMediaUpload] = useState<MediaUploadState>(initialMediaUpload)
  const [mediaEpisodes, setMediaEpisodes] = useState<Episode[]>([])
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [showMediaDialog, setShowMediaDialog] = useState(false)

  const [premiereEditor, setPremiereEditor] = useState<{ content: AdminContentItem; value: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminContentItem | null>(null)

  const [auditFilters, setAuditFilters] = useState<AuditFilters>({ service: 'all', limit: 500, offset: 0 })
  const [auditFromInput, setAuditFromInput] = useState('')
  const [auditToInput, setAuditToInput] = useState('')
  const [auditItems, setAuditItems] = useState<AuditLogItem[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [downloadingAudit, setDownloadingAudit] = useState(false)
  const [auditPage, setAuditPage] = useState(1)
  const [auditPageSize, setAuditPageSize] = useState(25)
  const [expandedAuditKey, setExpandedAuditKey] = useState('')

  const selectedMediaContent = useMemo(
    () => contentItems.find((item) => item.content_id === mediaUpload.contentId) ?? null,
    [contentItems, mediaUpload.contentId],
  )

  const selectedEditContent = useMemo(
    () => contentItems.find((item) => item.content_id === editingContentId) ?? null,
    [contentItems, editingContentId],
  )

  const auditTotalPages = Math.max(1, Math.ceil(auditItems.length / auditPageSize))
  const auditPageItems = auditItems.slice((auditPage - 1) * auditPageSize, auditPage * auditPageSize)

  const contentStats = useMemo(() => ({
    total: contentItems.length,
    scheduled: contentItems.filter((content) => statusOf(content) === 'Programado').length,
    visible: contentItems.filter((content) => statusOf(content) === 'Visible').length,
    deleted: contentItems.filter((content) => statusOf(content) === 'Eliminado').length,
  }), [contentItems])

  const showFeedback = (modal: FeedbackModal) => {
    setFeedbackModal(modal)
  }

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true)
    try {
      const response = await adminService.listPlans()
      setPlans(
        response.data.plans.map((plan) => ({
          ...plan,
          features: getPlanFeatures(plan.id, DEFAULT_FEATURES[plan.name.toLowerCase()] ?? []),
        })),
      )
    } catch (error) {
      setNotice({ type: 'error', text: extractError(error, 'No se pudieron cargar los planes.') })
    } finally {
      setLoadingPlans(false)
    }
  }, [])

  const loadContent = useCallback(async () => {
    setLoadingContent(true)
    try {
      const response = await adminService.listContent({
        status: contentStatus,
        type: contentType === 'all' ? '' : contentType,
        query: contentQuery,
        limit: 200,
        offset: 0,
      })
      setContentItems(response.data.items ?? [])
    } catch (error) {
      setNotice({ type: 'error', text: extractError(error, 'No se pudo cargar el catálogo.') })
    } finally {
      setLoadingContent(false)
    }
  }, [contentQuery, contentStatus, contentType])

  const currentAuditFilters = useCallback((limit = auditFilters.limit ?? 500, offset = 0): AuditFilters => ({
    ...auditFilters,
    from: auditFromInput ? toApiDateTime(auditFromInput) : undefined,
    to: auditToInput ? toApiDateTime(auditToInput) : undefined,
    limit,
    offset,
  }), [auditFilters, auditFromInput, auditToInput])

  const loadAudit = useCallback(async () => {
    setLoadingAudit(true)
    try {
      const response = await adminService.listAudit(currentAuditFilters(auditFilters.limit ?? 500, 0))
      setAuditItems(response.data.items ?? [])
      setAuditPage(1)
      setExpandedAuditKey('')
      setNotice({ type: 'success', text: `Se cargaron ${response.data.items?.length ?? 0} registros.` })
    } catch (error) {
      setNotice({ type: 'error', text: extractError(error, 'No se pudo consultar auditoría.') })
    } finally {
      setLoadingAudit(false)
    }
  }, [auditFilters.limit, currentAuditFilters])

  const fetchAllAuditItems = useCallback(async () => {
    const pageSize = 1000
    const allItems: AuditLogItem[] = []
    let offset = 0

    while (true) {
      const response = await adminService.listAudit(currentAuditFilters(pageSize, offset))
      const items = response.data.items ?? []
      allItems.push(...items)
      if (items.length < pageSize) break
      offset += pageSize
    }

    return allItems
  }, [currentAuditFilters])

  const loadAllAudit = async () => {
    setLoadingAudit(true)
    try {
      const items = await fetchAllAuditItems()
      setAuditItems(items)
      setAuditPage(1)
      setExpandedAuditKey('')
      setNotice({ type: 'success', text: `Se cargaron ${items.length} registros.` })
    } catch (error) {
      setNotice({ type: 'error', text: extractError(error, 'No se pudo cargar toda la auditoría.') })
    } finally {
      setLoadingAudit(false)
    }
  }

  useEffect(() => {
    loadContent()
  }, [loadContent])

  useEffect(() => {
    loadPlans()
  }, [loadPlans])

  useEffect(() => {
    if (!mediaUpload.contentId || mediaUpload.mediaType !== 'episode_video') {
      setMediaEpisodes([])
      return
    }

    catalogService.episodes(mediaUpload.contentId, 1)
      .then((response) => setMediaEpisodes(response.data.episodes ?? []))
      .catch(() => setMediaEpisodes([]))
  }, [mediaUpload.contentId, mediaUpload.mediaType])

  useEffect(() => {
    setAuditPage((current) => Math.min(current, auditTotalPages))
  }, [auditTotalPages])

  const handleLogout = async () => {
    await logout()
    navigate('/login/admin')
  }

  const startEditPlan = (plan: PlanWithFeatures) => {
    setEditingPlanId(plan.id)
    setEditPlanForm({
      name: plan.name,
      price_usd: String(plan.price_usd),
      features: plan.features.join('\n'),
    })
  }

  const savePlan = async (planId: number) => {
    setSavingPlan(true)
    try {
      await adminService.updatePlan(planId, {
        name: editPlanForm.name.trim(),
        price_usd: Number(editPlanForm.price_usd),
      })
      const features = editPlanForm.features.split('\n').map((item) => item.trim()).filter(Boolean)
      setPlanFeatures(planId, features)
      setEditingPlanId(null)
      await loadPlans()
      showFeedback({ title: 'Plan actualizado', text: 'Los cambios del plan se guardaron correctamente.' })
    } catch (error) {
      setNotice({ type: 'error', text: extractError(error, 'No se pudo guardar el plan.') })
    } finally {
      setSavingPlan(false)
    }
  }

  const updateEpisode = (index: number, patch: Partial<EpisodeForm>) => {
    setEpisodes((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const addEpisode = () => setEpisodes((items) => [...items, newEpisode(items.length + 1)])
  const removeEpisode = (index: number) => {
    setEpisodes((items) => (items.length > 1 ? items.filter((_, i) => i !== index) : items))
  }

  const resetContentForm = () => {
    setEditingContentId(null)
    setContentForm(initialContentForm)
    setEpisodes([newEpisode()])
    setPosterFile(null)
    setMovieVideoFile(null)
    setMovieVideoDurationLabel('')
  }

  const resetCreateForm = () => {
    setEditingContentId(null)
    setContentForm(initialContentForm)
    setEpisodes([newEpisode()])
    setPosterFile(null)
    setMovieVideoFile(null)
    setMovieVideoDurationLabel('')
  }

  const contentPayload = () => ({
    type: contentForm.type,
    title: contentForm.title.trim(),
    overview: contentForm.overview.trim(),
    releaseDate: contentForm.releaseDate,
    availableFrom: toApiDateTime(contentForm.availableFrom),
    genres: parseCsv(contentForm.genres),
    cast: parseCast(contentForm.cast),
    episodes: contentForm.type === 'series'
      ? episodes.map<EpisodeInput>((episode) => ({
          seasonNumber: Number(episode.seasonNumber || 1),
          episodeNumber: Number(episode.episodeNumber || 0),
          title: episode.title.trim(),
          overview: episode.overview.trim(),
          runtimeMinutes: Number(episode.runtimeMinutes || 0),
        }))
      : [],
  })

  const uploadAndConfirm = async (
    contentId: string,
    mediaType: MediaType,
    file: File,
    episodeId = '',
  ) => {
    const uploadResponse = await adminService.generateUploadUrl({
      contentId,
      episodeId,
      mediaType,
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    })

    const upload = await fetch(uploadResponse.data.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })

    if (!upload.ok) {
      throw new Error(`No se pudo subir el archivo. Estado ${upload.status}.`)
    }

    await adminService.confirmMedia({
      contentId,
      episodeId,
      mediaType,
      objectKey: uploadResponse.data.object_key,
      contentType: file.type,
    })
  }

  const selectMovieVideo = async (file: File | null) => {
    setMovieVideoFile(file)
    setMovieVideoDurationLabel('')
    if (!file) return
    try {
      const duration = await getVideoDuration(file)
      setMovieVideoDurationLabel(duration.label)
    } catch {
      setMovieVideoDurationLabel('No se pudo calcular la duración.')
    }
  }

  const selectEpisodeVideo = async (index: number, file: File | null) => {
    updateEpisode(index, { videoFile: file, videoDurationLabel: '', runtimeMinutes: '' })
    if (!file) return

    try {
      const duration = await getVideoDuration(file)
      updateEpisode(index, {
        videoFile: file,
        runtimeMinutes: String(duration.minutes),
        videoDurationLabel: `${duration.label} (${duration.minutes} min guardados)`,
      })
    } catch {
      updateEpisode(index, { videoDurationLabel: 'No se pudo calcular la duración.' })
    }
  }

  const selectMediaFile = async (file: File | null) => {
    setMediaUpload((current) => ({ ...current, file, durationLabel: '' }))
    if (!file || mediaUpload.mediaType === 'poster') return

    try {
      const duration = await getVideoDuration(file)
      setMediaUpload((current) => ({ ...current, file, durationLabel: duration.label }))
    } catch {
      setMediaUpload((current) => ({ ...current, file, durationLabel: 'No se pudo calcular la duración.' }))
    }
  }

  const handleSaveContent = async () => {
    setSavingContent(true)
    setNotice(null)
    try {
      if (!contentForm.title.trim()) throw new Error('Ingresa el título del contenido.')
      if (contentForm.type === 'series' && episodes.some((episode) => !episode.title.trim())) {
        throw new Error('Cada episodio debe tener título.')
      }

      const payload = contentPayload()
      let contentId = editingContentId ?? ''
      let createdEpisodes: CreatedEpisode[] = []

      if (editingContentId) {
        await adminService.updateContent(editingContentId, payload)
        showFeedback({ title: 'Contenido actualizado', text: 'Los cambios se guardaron correctamente.' })
      } else {
        const response = await adminService.createContent(payload)
        contentId = response.data.content_id
        createdEpisodes = response.data.episodes ?? []
      }

      if (posterFile) await uploadAndConfirm(contentId, 'poster', posterFile)
      if (contentForm.type === 'movie' && movieVideoFile) await uploadAndConfirm(contentId, 'movie_video', movieVideoFile)

      if (!editingContentId && contentForm.type === 'series') {
        for (const episode of episodes) {
          if (!episode.videoFile) continue
          const created = createdEpisodes.find(
            (item) =>
              item.season_number === Number(episode.seasonNumber || 1)
              && item.episode_number === Number(episode.episodeNumber || 0),
          )
          if (!created) throw new Error(`No se pudo resolver el episodio ${episode.episodeNumber}.`)
          await uploadAndConfirm(contentId, 'episode_video', episode.videoFile, created.episode_id)
        }
      }

      const wasEditing = Boolean(editingContentId)
      resetContentForm()
      await loadContent()
      if (!wasEditing) {
        showFeedback({
          title: 'Contenido creado',
          text: 'El contenido se guardó correctamente y ya está disponible según su fecha de estreno.',
          actionLabel: 'Ver catálogo',
          onAction: () => setActiveTab('catalog'),
        })
      } else {
        setActiveTab('catalog')
      }
    } catch (error) {
      setNotice({ type: 'error', text: extractError(error, 'No se pudo guardar el contenido.') })
    } finally {
      setSavingContent(false)
    }
  }

  const startEditContent = async (content: AdminContentItem) => {
    setNotice(null)
    try {
      const detailResponse = await catalogService.detail(content.content_id)
      const detail = detailResponse.data
      const detailContent = detail.content

      setEditingContentId(content.content_id)
      setContentForm({
        type: detailContent.type === 'series' ? 'series' : 'movie',
        title: detailContent.title ?? '',
        overview: detailContent.overview ?? '',
        releaseDate: asInputDate(detailContent.release_date),
        availableFrom: asInputDateTime(detailContent.available_from),
        genres: detailContent.genres?.map((genre) => genre.name).join(', ') ?? '',
        cast: detail.cast?.map((member) => `${member.actor_name} | ${member.character_name}`).join('\n') ?? '',
      })

      if (detailContent.type === 'series') {
        const episodeResponse = await catalogService.episodes(content.content_id, 1)
        const mapped = (episodeResponse.data.episodes ?? []).map((episode) => ({
          seasonNumber: String(episode.season_number),
          episodeNumber: String(episode.episode_number),
          title: episode.title,
          overview: episode.overview,
          runtimeMinutes: String(episode.runtime_minutes || ''),
          videoFile: null,
          videoDurationLabel: episode.runtime_minutes ? `${episode.runtime_minutes} min guardados` : '',
        }))
        setEpisodes(mapped.length > 0 ? mapped : [newEpisode()])
      } else {
        setEpisodes([newEpisode()])
      }

      setPosterFile(null)
      setMovieVideoFile(null)
      setMovieVideoDurationLabel('')
      setActiveTab('edit')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setNotice({ type: 'error', text: extractError(error, 'No se pudo cargar el contenido.') })
    }
  }

  const requestDeleteContent = (content: AdminContentItem) => {
    setDeleteTarget(content)
  }

  const confirmDeleteContent = async () => {
    if (!deleteTarget) return
    try {
      await adminService.deleteContent(deleteTarget.content_id)
      setDeleteTarget(null)
      await loadContent()
      showFeedback({ title: 'Contenido eliminado', text: 'El contenido dejó de mostrarse en el catálogo.' })
    } catch (error) {
      setNotice({ type: 'error', text: extractError(error, 'No se pudo eliminar el contenido.') })
    }
  }

  const openScheduleEditor = (content: AdminContentItem) => {
    setPremiereEditor({ content, value: asInputDateTime(content.available_from) })
  }

  const confirmScheduleContent = async () => {
    if (!premiereEditor) return
    try {
      await adminService.schedulePremiere(premiereEditor.content.content_id, toApiDateTime(premiereEditor.value))
      setPremiereEditor(null)
      await loadContent()
      showFeedback({ title: 'Fecha de estreno actualizada', text: 'La nueva fecha se guardó correctamente.' })
    } catch (error) {
      setNotice({ type: 'error', text: extractError(error, 'No se pudo guardar la fecha de estreno.') })
    }
  }

  const openMediaDialog = (content: AdminContentItem, mediaType: MediaType = 'poster') => {
    setMediaUpload({ contentId: content.content_id, episodeId: '', mediaType, file: null, durationLabel: '' })
    setShowMediaDialog(true)
  }

  const handleManualMediaUpload = async () => {
    setUploadingMedia(true)
    setNotice(null)
    try {
      if (!mediaUpload.contentId) throw new Error('Selecciona un contenido.')
      if (!mediaUpload.file) throw new Error('Selecciona un archivo.')
      if (mediaUpload.mediaType === 'episode_video' && !mediaUpload.episodeId) {
        throw new Error('Selecciona un episodio.')
      }

      await uploadAndConfirm(
        mediaUpload.contentId,
        mediaUpload.mediaType,
        mediaUpload.file,
        mediaUpload.mediaType === 'episode_video' ? mediaUpload.episodeId : '',
      )
      setMediaUpload((current) => ({ ...current, file: null, durationLabel: '' }))
      setShowMediaDialog(false)
      await loadContent()
      showFeedback({ title: 'Archivo guardado', text: `${mediaTypeLabel(mediaUpload.mediaType)} actualizado correctamente.` })
    } catch (error) {
      setNotice({ type: 'error', text: extractError(error, 'No se pudo cargar el archivo.') })
    } finally {
      setUploadingMedia(false)
    }
  }


  const resetAuditFilters = () => {
    setAuditFilters({ service: 'all', limit: 500, offset: 0 })
    setAuditFromInput('')
    setAuditToInput('')
    setAuditItems([])
    setAuditPage(1)
    setExpandedAuditKey('')
  }

  const downloadAudit = async (format: 'csv' | 'pdf') => {
    setDownloadingAudit(true)
    try {
      if (format === 'csv') {
        const response = await adminService.downloadAuditCsv(currentAuditFilters(Math.max(auditFilters.limit ?? 500, 1000), 0))
        downloadBlob(response.data, 'quetxal-tv-auditoria.csv')
        return
      }

      const response = await adminService.downloadAuditPdf(currentAuditFilters(1000, 0))
      downloadBlob(response.data, 'quetxal-tv-auditoria.pdf')
      showFeedback({ title: 'PDF generado', text: 'El reporte fue generado por el servidor y está listo para revisar.' })
    } catch (error) {
      setNotice({ type: 'error', text: extractError(error, `No se pudo descargar ${format.toUpperCase()}.`) })
    } finally {
      setDownloadingAudit(false)
    }
  }

  const visibleTabs: Array<{ id: PanelTab; label: string }> = [
    { id: 'catalog', label: 'Catálogo' },
    { id: 'create', label: 'Crear' },
    { id: 'edit', label: 'Editar' },
    { id: 'audit', label: 'Auditoría' },
    { id: 'plans', label: 'Planes' },
  ]

  const renderContentForm = (mode: 'create' | 'edit') => {
    const isEditing = mode === 'edit'
    return (
      <section className={styles.card}>
        <div className={styles.cardHeaderCompact}>
          <div>
            <h2 className={styles.cardTitle}>{isEditing ? 'Editar contenido' : 'Crear contenido'}</h2>
            <p className={styles.cardSub}>{isEditing ? 'Actualiza los datos principales del contenido seleccionado.' : 'Agrega una película o serie al catálogo.'}</p>
          </div>
          {isEditing && selectedEditContent && <span className={styles.editingBadge}>{selectedEditContent.title}</span>}
        </div>

        {isEditing && !editingContentId ? (
          <div className={styles.emptyState}>Selecciona un contenido desde la lista para editarlo.</div>
        ) : (
          <>
            <div className={styles.contentForm}>
              <label className={styles.field}>
                Tipo
                <select
                  value={contentForm.type}
                  onChange={(e) => setContentForm((form) => ({ ...form, type: e.target.value as ContentType }))}
                  disabled={isEditing}
                >
                  <option value="movie">Película</option>
                  <option value="series">Serie</option>
                </select>
              </label>

              <label className={styles.field}>
                Título
                <input
                  value={contentForm.title}
                  onChange={(e) => setContentForm((form) => ({ ...form, title: e.target.value }))}
                  placeholder="Nombre del contenido"
                />
              </label>

              <label className={styles.field}>
                Lanzamiento
                <input
                  type="date"
                  value={contentForm.releaseDate}
                  onChange={(e) => setContentForm((form) => ({ ...form, releaseDate: e.target.value }))}
                />
              </label>

              <label className={styles.field}>
                Fecha de estreno
                <input
                  type="datetime-local"
                  value={contentForm.availableFrom}
                  onChange={(e) => setContentForm((form) => ({ ...form, availableFrom: e.target.value }))}
                />
              </label>

              <label className={`${styles.field} ${styles.fullWidth}`}>
                Géneros
                <input
                  value={contentForm.genres}
                  onChange={(e) => setContentForm((form) => ({ ...form, genres: e.target.value }))}
                  placeholder="Drama, Acción, Suspenso"
                />
              </label>

              <label className={`${styles.field} ${styles.fullWidth}`}>
                Descripción
                <textarea
                  rows={4}
                  value={contentForm.overview}
                  onChange={(e) => setContentForm((form) => ({ ...form, overview: e.target.value }))}
                  placeholder="Sinopsis"
                />
              </label>

              <label className={`${styles.field} ${styles.fullWidth}`}>
                Reparto
                <textarea
                  rows={3}
                  value={contentForm.cast}
                  onChange={(e) => setContentForm((form) => ({ ...form, cast: e.target.value }))}
                  placeholder="Actor | Personaje"
                />
              </label>

              {!isEditing && (
                <>
                  <label className={styles.field}>
                    Portada
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => setPosterFile(e.target.files?.[0] ?? null)}
                    />
                    {posterFile && <span className={styles.fileHint}>{posterFile.name} · {fileSizeLabel(posterFile)}</span>}
                  </label>
                  {contentForm.type === 'movie' && (
                    <label className={styles.field}>
                      Video
                      <input
                        type="file"
                        accept="video/mp4,video/webm"
                        onChange={(e) => void selectMovieVideo(e.target.files?.[0] ?? null)}
                      />
                      {movieVideoFile && <span className={styles.fileHint}>{movieVideoFile.name} · {fileSizeLabel(movieVideoFile)}</span>}
                      {movieVideoDurationLabel && <span className={styles.fileHint}>Duración detectada: {movieVideoDurationLabel}</span>}
                    </label>
                  )}
                </>
              )}
            </div>

            {contentForm.type === 'series' && (
              <div className={styles.episodesBox}>
                <div className={styles.episodesHeader}>
                  <div>
                    <h3>Episodios</h3>
                    <p>La duración se calcula al seleccionar el video y se guarda en minutos.</p>
                  </div>
                  {!isEditing && <button className="btn btn-secondary btn-sm" onClick={addEpisode} type="button">Agregar</button>}
                </div>
                {episodes.map((episode, index) => (
                  <div key={`${index}-${episode.episodeNumber}`} className={styles.episodeCard}>
                    <label className={styles.field}>
                      Temporada
                      <input type="number" min="1" value={episode.seasonNumber} onChange={(e) => updateEpisode(index, { seasonNumber: e.target.value })} />
                    </label>
                    <label className={styles.field}>
                      Episodio
                      <input type="number" min="1" value={episode.episodeNumber} onChange={(e) => updateEpisode(index, { episodeNumber: e.target.value })} />
                    </label>
                    <label className={styles.field}>
                      Título
                      <input value={episode.title} onChange={(e) => updateEpisode(index, { title: e.target.value })} />
                    </label>
                    <label className={styles.field}>
                      Duración
                      <input value={episode.videoDurationLabel || (episode.runtimeMinutes ? `${episode.runtimeMinutes} min` : 'Pendiente')} readOnly />
                    </label>
                    <label className={`${styles.field} ${styles.fullWidth}`}>
                      Descripción
                      <textarea rows={2} value={episode.overview} onChange={(e) => updateEpisode(index, { overview: e.target.value })} />
                    </label>
                    {!isEditing && (
                      <label className={styles.field}>
                        Video
                        <input type="file" accept="video/mp4,video/webm" onChange={(e) => void selectEpisodeVideo(index, e.target.files?.[0] ?? null)} />
                        {episode.videoFile && <span className={styles.fileHint}>{episode.videoFile.name} · {fileSizeLabel(episode.videoFile)}</span>}
                      </label>
                    )}
                    {!isEditing && (
                      <div className={styles.episodeActions}>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => removeEpisode(index)}>Quitar</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isEditing && (
              <div className={styles.infoPanelMinimal}>
                Para cambiar portada o video usa el botón <strong>Archivos</strong> del contenido. Así se conserva la relación del episodio seleccionado.
              </div>
            )}

            <div className={styles.createActions}>
              {isEditing && <button className="btn btn-ghost" onClick={() => { resetContentForm(); setActiveTab('catalog') }}>Cancelar</button>}
              {!isEditing && <button className="btn btn-ghost" onClick={resetCreateForm}>Limpiar</button>}
              <button className="btn btn-primary" onClick={handleSaveContent} disabled={savingContent}>
                {savingContent ? <span className="spinner" /> : isEditing ? 'Guardar cambios' : 'Crear contenido'}
              </button>
            </div>
          </>
        )}
      </section>
    )
  }

  const renderContentList = (showEditButton = true, editButtonLabel = 'Editar') => (
    <section className={styles.card}>
      <div className={styles.cardHeaderCompact}>
        <div>
          <h2 className={styles.cardTitle}>Catálogo</h2>
          <p className={styles.cardSub}>{contentStats.total} contenidos cargados</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadContent} disabled={loadingContent}>Actualizar</button>
      </div>

      <div className={styles.filtersCompact}>
        <select value={contentStatus} onChange={(e) => setContentStatus(e.target.value as AdminContentStatus)}>
          <option value="all">Todos</option>
          <option value="visible">Visibles</option>
          <option value="scheduled">Programados</option>
          <option value="deleted">Eliminados</option>
        </select>
        <select value={contentType} onChange={(e) => setContentType(e.target.value as 'all' | ContentType)}>
          <option value="all">Todo tipo</option>
          <option value="movie">Películas</option>
          <option value="series">Series</option>
        </select>
        <input value={contentQuery} onChange={(e) => setContentQuery(e.target.value)} placeholder="Buscar" />
      </div>

      {loadingContent ? (
        <div className={styles.loading}><span className="spinner" /></div>
      ) : (
        <div className={styles.contentList}>
          {contentItems.map((content) => (
            <article key={content.content_id} className={`${styles.contentRow} ${editingContentId === content.content_id ? styles.contentRowActive : ''}`}>
              <div className={styles.thumb}>
                {content.poster_path ? <img src={content.poster_path} alt={content.title} /> : <span>{content.type === 'series' ? 'S' : 'P'}</span>}
              </div>
              <div className={styles.contentInfo}>
                <div className={styles.contentTitleLine}>
                  <strong>{content.title}</strong>
                  <span className={`${styles.statusPill} ${statusClass(content)}`}>{statusOf(content)}</span>
                </div>
                <p>{content.type === 'series' ? 'Serie' : 'Película'} · {contentGenres(content) || 'Sin géneros'}</p>
                <p>Fecha de estreno {formatDate(content.available_from)}</p>
                <div className={styles.assetBadges}>
                  <span className={content.poster_path ? styles.assetOk : styles.assetMissing}>Portada</span>
                  <span className={(content.type === 'movie' && content.media_url) || content.type === 'series' ? styles.assetOk : styles.assetMissing}>Video</span>
                </div>
              </div>
              <div className={styles.rowActions}>
                {showEditButton && <button className="btn btn-ghost btn-sm" onClick={() => void startEditContent(content)} disabled={Boolean(content.deleted_at)}>{editButtonLabel}</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => openScheduleEditor(content)} disabled={Boolean(content.deleted_at)}>Estreno</button>
                <button className="btn btn-ghost btn-sm" onClick={() => openMediaDialog(content)} disabled={Boolean(content.deleted_at)}>Archivos</button>
                <button className="btn btn-secondary btn-sm" onClick={() => requestDeleteContent(content)} disabled={Boolean(content.deleted_at)}>Eliminar</button>
              </div>
            </article>
          ))}
          {contentItems.length === 0 && <div className={styles.emptyState}>No hay contenido con estos filtros.</div>}
        </div>
      )}
    </section>
  )

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>Q</span>
          <span>uetxal TV</span>
          <span className={styles.adminBadge}>Admin</span>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.userHint}>{user?.email}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/catalog')}>Ver catálogo</button>
          <button className="btn btn-primary btn-sm" onClick={handleLogout}>Salir</button>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.heroCard}>
          <div>
            <p className={styles.kicker}>Panel administrativo</p>
            <h1>Administra Quetxal TV</h1>
            <p>Gestiona contenido, estrenos, archivos y reportes desde un solo lugar.</p>
          </div>
          <div className={styles.heroStats}>
            <div><strong>{contentStats.visible}</strong><span>visibles</span></div>
            <div><strong>{contentStats.scheduled}</strong><span>programados</span></div>
            <div><strong>{contentStats.deleted}</strong><span>eliminados</span></div>
          </div>
        </section>

        <nav className={styles.tabs} aria-label="Secciones del panel">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              onClick={() => {
                if (tab.id === 'create') resetCreateForm()
                setActiveTab(tab.id)
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {notice && (
          <div className={notice.type === 'success' ? styles.successMsg : notice.type === 'info' ? styles.infoMsg : styles.errorMsg}>
            {notice.text}
          </div>
        )}

        {activeTab === 'catalog' && renderContentList(true)}

        {activeTab === 'create' && renderContentForm('create')}

        {activeTab === 'edit' && (
          <div className={styles.gridTwo}>
            {renderContentForm('edit')}
            {renderContentList(true, 'Seleccionar')}
          </div>
        )}

        {activeTab === 'audit' && (
          <section className={styles.card}>
            <div className={styles.cardHeaderCompact}>
              <div>
                <h2 className={styles.cardTitle}>Auditoría</h2>
                <p className={styles.cardSub}>Consulta cambios y descarga reportes.</p>
              </div>
              <div className={styles.headerTools}>
                <button className="btn btn-ghost btn-sm" onClick={() => downloadAudit('csv')} disabled={downloadingAudit || auditItems.length === 0}>CSV</button>
                <button className="btn btn-primary btn-sm" onClick={() => downloadAudit('pdf')} disabled={downloadingAudit || auditItems.length === 0}>{downloadingAudit ? <span className="spinner" /> : 'PDF'}</button>
              </div>
            </div>

            <div className={styles.auditFilters}>
              <div className={styles.auditFiltersHeader}>
                <div>
                  <strong>Filtros</strong>
                  <span>Busca cambios por módulo, fecha, tabla o tipo de acción.</span>
                </div>
                <div className={styles.auditFilterActions}>
                  <button className="btn btn-primary btn-sm" onClick={loadAudit} disabled={loadingAudit}>{loadingAudit ? <span className="spinner" /> : 'Buscar'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={resetAuditFilters}>Restablecer</button>
                </div>
              </div>

              <div className={styles.auditFilterGrid}>
                <label className={styles.field}>
                  Módulo
                  <select value={auditFilters.service} onChange={(e) => setAuditFilters((current) => ({ ...current, service: e.target.value as AuditService }))}>
                    <option value="all">Todos</option>
                    <option value="catalog">Catálogo</option>
                    <option value="identity">Usuarios</option>
                    <option value="subscription">Suscripciones</option>
                    <option value="engagement">Actividad</option>
                  </select>
                </label>
                <label className={styles.field}>
                  Tabla
                  <input value={auditFilters.table_name ?? ''} onChange={(e) => setAuditFilters((current) => ({ ...current, table_name: e.target.value }))} placeholder="Todas" />
                </label>
                <label className={styles.field}>
                  Tipo de cambio
                  <select value={auditFilters.action ?? ''} onChange={(e) => setAuditFilters((current) => ({ ...current, action: e.target.value }))}>
                    <option value="">Todos</option>
                    <option value="INSERT">Creación</option>
                    <option value="UPDATE">Actualización</option>
                    <option value="DELETE">Eliminación</option>
                  </select>
                </label>
                <label className={styles.field}>
                  Desde
                  <input type="datetime-local" value={auditFromInput} onChange={(e) => setAuditFromInput(e.target.value)} />
                </label>
                <label className={styles.field}>
                  Hasta
                  <input type="datetime-local" value={auditToInput} onChange={(e) => setAuditToInput(e.target.value)} />
                </label>
                <label className={styles.field}>
                  Cantidad
                  <select value={auditFilters.limit ?? 500} onChange={(e) => setAuditFilters((current) => ({ ...current, limit: Number(e.target.value), offset: 0 }))}>
                    <option value={100}>100 registros</option>
                    <option value={250}>250 registros</option>
                    <option value={500}>500 registros</option>
                    <option value={1000}>1000 registros</option>
                  </select>
                </label>
              </div>

              <div className={styles.auditLoadRow}>
                <span>Para exportar el historial completo, carga todos los registros antes de generar el PDF.</span>
                <button className="btn btn-secondary btn-sm" onClick={loadAllAudit} disabled={loadingAudit}>{loadingAudit ? <span className="spinner" /> : 'Cargar todo'}</button>
              </div>
            </div>

            <div className={styles.auditSummary}>
              <strong>{auditItems.length}</strong>
              <span>registros cargados</span>
              <span>Página {auditPage} de {auditTotalPages}</span>
            </div>

            <div className={styles.auditList}>
              {auditPageItems.map((item) => {
                const key = `${item.service}-${item.audit_id}`
                const expanded = expandedAuditKey === key
                return (
                  <article className={styles.auditCard} key={key}>
                    <div className={styles.auditCardMain}>
                      <div className={styles.auditMetaBlock}>
                        <span className={styles.auditLabel}>Fecha</span>
                        <strong>{formatDate(item.created_at)}</strong>
                      </div>
                      <div className={styles.auditMetaBlock}>
                        <span className={styles.auditLabel}>Servicio</span>
                        <strong>{serviceLabel(item.service)}</strong>
                      </div>
                      <div className={styles.auditMetaBlock}>
                        <span className={styles.auditLabel}>Acción</span>
                        <span className={styles.actionBadge}>{actionLabel(item.action)}</span>
                      </div>
                      <div className={styles.auditMetaBlock}>
                        <span className={styles.auditLabel}>Tabla</span>
                        <strong>{item.table_name || 'Sin tabla'}</strong>
                      </div>
                      <div className={styles.auditUserBlock}>
                        <span className={styles.auditLabel}>Usuario</span>
                        <strong>{item.actor_email || item.actor_user_id || 'Sistema'}</strong>
                      </div>
                      <div className={styles.auditChangeBlock}>
                        <span className={styles.auditLabel}>Resumen</span>
                        <p>{readableChange(item)}</p>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => setExpandedAuditKey(expanded ? '' : key)}>
                        {expanded ? 'Ocultar' : 'Ver detalle'}
                      </button>
                    </div>
                    {expanded && (
                      <div className={styles.auditDetailPanel}>
                        <div className={styles.auditDetailHeader}>
                          <strong>Detalle del cambio</strong>
                          <span>{item.record_id || 'Sin registro asociado'}</span>
                        </div>
                        <div className={styles.auditDetailGrid}>
                          <div>
                            <strong>Antes</strong>
                            <pre>{safeJson(item.old_state_json)}</pre>
                          </div>
                          <div>
                            <strong>Después</strong>
                            <pre>{safeJson(item.new_state_json)}</pre>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
              {auditItems.length === 0 && <div className={styles.emptyState}>Aplica los filtros para consultar la auditoría.</div>}
            </div>

            <div className={styles.paginationBar}>
              <div className={styles.pageSizeControl}>
                <span>Filas por página</span>
                <select value={auditPageSize} onChange={(e) => { setAuditPageSize(Number(e.target.value)); setAuditPage(1) }}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <div className={styles.pageButtons}>
                <button className="btn btn-ghost btn-sm" onClick={() => setAuditPage(1)} disabled={auditPage === 1}>Inicio</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAuditPage((page) => Math.max(1, page - 1))} disabled={auditPage === 1}>Anterior</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAuditPage((page) => Math.min(auditTotalPages, page + 1))} disabled={auditPage === auditTotalPages}>Siguiente</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAuditPage(auditTotalPages)} disabled={auditPage === auditTotalPages}>Final</button>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'plans' && (
          <section className={styles.card}>
            <div className={styles.cardHeaderCompact}>
              <div>
                <h2 className={styles.cardTitle}>Planes</h2>
                <p className={styles.cardSub}>Actualiza nombre, precio y características.</p>
              </div>
            </div>

            {loadingPlans ? (
              <div className={styles.loading}><span className="spinner" /></div>
            ) : (
              <div className={styles.plansGrid}>
                {plans.map((plan) => (
                  <div key={plan.id} className={`${styles.planCard} ${editingPlanId === plan.id ? styles.editing : ''}`}>
                    <div className={styles.planTop}>
                      <span className={styles.planId}>#{plan.id}</span>
                      <span className={`${styles.planStatus} ${plan.is_active ? styles.active : styles.inactive}`}>{plan.is_active ? 'Activo' : 'Inactivo'}</span>
                    </div>
                    {editingPlanId === plan.id ? (
                      <div className={styles.editFields}>
                        <label className={styles.field}>Nombre<input value={editPlanForm.name} onChange={(e) => setEditPlanForm((form) => ({ ...form, name: e.target.value }))} /></label>
                        <label className={styles.field}>Precio USD<input type="number" step="0.01" min="0" value={editPlanForm.price_usd} onChange={(e) => setEditPlanForm((form) => ({ ...form, price_usd: e.target.value }))} /></label>
                        <label className={styles.field}>Características<textarea rows={4} value={editPlanForm.features} onChange={(e) => setEditPlanForm((form) => ({ ...form, features: e.target.value }))} /></label>
                        <div className={styles.editActions}>
                          <button className="btn btn-primary" onClick={() => savePlan(plan.id)} disabled={savingPlan}>{savingPlan ? <span className="spinner" /> : 'Guardar'}</button>
                          <button className="btn btn-secondary" onClick={() => setEditingPlanId(null)} disabled={savingPlan}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.planView}>
                        <div className={styles.planName}>{plan.name}</div>
                        <div className={styles.planPrice}>${plan.price_usd.toFixed(2)} <span>USD/mes</span></div>
                        <ul className={styles.featureList}>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                        <button className="btn btn-secondary" onClick={() => startEditPlan(plan)}>Editar</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {premiereEditor && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h3>Programar fecha de estreno</h3>
            <p>{premiereEditor.content.title}</p>
            <label className={styles.field}>
              Fecha de estreno
              <input
                type="datetime-local"
                value={premiereEditor.value}
                onChange={(e) => setPremiereEditor((current) => current ? { ...current, value: e.target.value } : current)}
              />
            </label>
            <div className={styles.modalActions}>
              <button className="btn btn-ghost" onClick={() => setPremiereEditor(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmScheduleContent}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h3>Eliminar contenido</h3>
            <p>{deleteTarget.title}</p>
            <p className={styles.modalMuted}>El contenido dejará de mostrarse en el catálogo.</p>
            <div className={styles.modalActions}>
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmDeleteContent}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {feedbackModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={`${styles.modalCard} ${styles.successModal}`}>
            <div className={styles.successIcon}>✓</div>
            <h3>{feedbackModal.title}</h3>
            <p>{feedbackModal.text}</p>
            <div className={styles.modalActions}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const action = feedbackModal.onAction
                  setFeedbackModal(null)
                  action?.()
                }}
              >
                {feedbackModal.actionLabel ?? 'Entendido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMediaDialog && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={`${styles.modalCard} ${styles.mediaModal}`}>
            <div className={styles.cardHeaderCompact}>
              <div>
                <h3>Agregar archivo</h3>
                <p>{selectedMediaContent?.title ?? 'Selecciona contenido'}</p>
              </div>
            </div>

            <div className={styles.contentForm}>
              <label className={`${styles.field} ${styles.fullWidth}`}>
                Contenido
                <select
                  value={mediaUpload.contentId}
                  onChange={(e) => setMediaUpload((current) => ({ ...current, contentId: e.target.value, episodeId: '', durationLabel: '' }))}
                >
                  <option value="">Selecciona contenido</option>
                  {contentItems.filter((content) => !content.deleted_at).map((content) => (
                    <option key={content.content_id} value={content.content_id}>{content.title} ({content.type === 'series' ? 'Serie' : 'Película'})</option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                Archivo para
                <select
                  value={mediaUpload.mediaType}
                  onChange={(e) => setMediaUpload((current) => ({ ...current, mediaType: e.target.value as MediaType, episodeId: '', file: null, durationLabel: '' }))}
                >
                  <option value="poster">Portada</option>
                  <option value="movie_video" disabled={selectedMediaContent?.type === 'series'}>Película</option>
                  <option value="episode_video" disabled={selectedMediaContent?.type !== 'series'}>Episodio</option>
                </select>
              </label>

              {mediaUpload.mediaType === 'episode_video' && (
                <label className={styles.field}>
                  Episodio
                  <select value={mediaUpload.episodeId} onChange={(e) => setMediaUpload((current) => ({ ...current, episodeId: e.target.value }))}>
                    <option value="">Selecciona episodio</option>
                    {mediaEpisodes.map((episode) => (
                      <option key={episode.episode_id} value={episode.episode_id}>
                        T{episode.season_number} E{episode.episode_number} - {episode.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className={styles.field}>
                Archivo
                <input
                  type="file"
                  accept={mediaUpload.mediaType === 'poster' ? 'image/jpeg,image/png,image/webp' : 'video/mp4,video/webm'}
                  onChange={(e) => void selectMediaFile(e.target.files?.[0] ?? null)}
                />
                {mediaUpload.file && <span className={styles.fileHint}>{mediaUpload.file.name} · {fileSizeLabel(mediaUpload.file)}</span>}
                {mediaUpload.durationLabel && <span className={styles.fileHint}>Duración detectada: {mediaUpload.durationLabel}</span>}
              </label>
            </div>

            <div className={styles.infoPanelMinimal}>
              {mediaUpload.mediaType === 'episode_video'
                ? 'Selecciona el episodio antes de guardar. El archivo se reemplazará solo para ese episodio.'
                : `${mediaTypeLabel(mediaUpload.mediaType)} seleccionado.`}
            </div>

            <div className={styles.modalActions}>
              <button className="btn btn-ghost" onClick={() => setShowMediaDialog(false)} disabled={uploadingMedia}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleManualMediaUpload} disabled={uploadingMedia}>
                {uploadingMedia ? <span className="spinner" /> : 'Guardar archivo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
