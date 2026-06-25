import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { profileService, type Profile } from '../services/profile.service'
import { useAuth } from '../hooks/useAuth'
import styles from './ProfilesPage.module.css'

const AVATAR_COLORS = [
  '#E50914', '#3B82F6', '#22C55E', '#F59E0B', '#8B5CF6',
]

function avatarInitial(name: string) {
  return name.charAt(0).toUpperCase()
}

export default function ProfilesPage() {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIsChild, setNewIsChild] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const loadProfiles = async () => {
    try {
      const res = await profileService.list()
      setProfiles(res.data.profiles)
    } catch {
      setError('No se pudieron cargar los perfiles')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfiles()
  }, [])

  const handleSelect = async (profileId: string) => {
    try {
      await profileService.select(profileId)
      await refresh()
      navigate('/catalog')
    } catch {
      setError('No se pudo seleccionar el perfil')
    }
  }

  const handleCreate = async () => {
    if (!newName.trim() || creating) return
    setCreating(true)
    try {
      await profileService.create({
        name: newName.trim(),
        is_child: newIsChild,
        parental_pin: newIsChild ? newPin : undefined,
      })
      setNewName('')
      setAdding(false)
      setNewIsChild(false)
      setNewPin('')
      await loadProfiles()
    } catch {
      setError('No se pudo crear el perfil')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.center}>
        <span className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <h1 className={styles.title}>¿Quién está viendo?</h1>
      <p className={styles.subtitle}>Hola, {user?.email}</p>

      <div className={styles.grid}>
        {profiles.map((p, i) => (
          <button
            key={p.profile_id}
            className={styles.profileCard}
            onClick={() => handleSelect(p.profile_id)}
          >
            <div
              className={styles.avatar}
              style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
            >
              {avatarInitial(p.name)}
            </div>
            <span className={styles.profileName}>{p.name}</span>
            {p.is_child && <small>Infantil · PIN</small>}
          </button>
        ))}

        {profiles.length < 5 && (
          adding ? (
            <div className={styles.addCard}>
              <input
                className="input"
                placeholder="Nombre del perfil"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.75rem' }}>
                <input
                  type="checkbox"
                  checked={newIsChild}
                  onChange={(e) => setNewIsChild(e.target.checked)}
                />
                Perfil infantil
              </label>

              {newIsChild && (
                <input
                  className="input"
                  placeholder="PIN parental de 4 dígitos"
                  value={newPin}
                  maxLength={4}
                  inputMode="numeric"
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              )}

              <div className={styles.addActions}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleCreate}
                  disabled={creating}
                >
                  {creating ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Crear'}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setAdding(false); setNewName(''); setNewIsChild(false); setNewPin('') }}
                  disabled={creating}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button className={styles.addProfileBtn} onClick={() => setAdding(true)}>
              <div className={styles.addIcon}>+</div>
              <span className={styles.profileName}>Añadir perfil</span>
            </button>
          )
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
