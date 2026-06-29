import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  recommendationService,
  type RecommendedContent,
} from '../services/recommendation.service'
import styles from './RecommendedRow.module.css'

export default function RecommendedRow() {
  const navigate = useNavigate()
  const [recs, setRecs] = useState<RecommendedContent[]>([])

  useEffect(() => {
    recommendationService
      .getRecommendations(12)
      .then((res) => {
        if (res.data.success) setRecs(res.data.items ?? [])
      })
      .catch(() => {})
  }, [])

  if (recs.length === 0) return null

  return (
    <div className={styles.section}>
      <div className="container">
        <h2 className={styles.heading}>Recomendados para ti</h2>
        <div className={styles.row}>
          {recs.map((item) => (
            <div
              key={item.content_id}
              className={styles.card}
              onClick={() => navigate(`/catalog/${item.content_id}`)}
            >
              <div className={styles.poster}>
                <span className={styles.initial}>
                  {item.title.charAt(0).toUpperCase()}
                </span>
                <div className={styles.overlay}>
                  <button className="btn btn-primary btn-sm">Ver ahora</button>
                </div>
              </div>
              <div className={styles.info}>
                <p className={styles.title}>{item.title}</p>
                <p className={styles.genres}>{item.genres.join(' · ')}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
