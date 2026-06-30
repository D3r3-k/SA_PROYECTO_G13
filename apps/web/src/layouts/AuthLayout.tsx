import type { ReactNode } from 'react'
import styles from './AuthLayout.module.css'

interface Props {
  children: ReactNode
}

export default function AuthLayout({ children }: Props) {
  return (
    <div className={styles.root}>
      <div className={styles.brand}>
        <span className={styles.logo}>C</span>
        <span className={styles.logoText}>alificacion</span>
      </div>
      <div className={styles.card}>{children}</div>
    </div>
  )
}
