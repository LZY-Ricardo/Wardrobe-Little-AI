import React from 'react'
import styles from './index.module.less'

export default function Skeleton({ rows = 3 }) {
  return (
    <div className={styles.skeleton}>
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className={styles.skeletonRow} />
      ))}
    </div>
  )
}
