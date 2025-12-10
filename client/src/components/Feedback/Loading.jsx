import React from 'react'
import styles from './index.module.less'

export default function Loading({ text = '加载中...' }) {
  return (
    <div className={styles.loading}>
      <div className={styles.spinner} />
      <span className={styles.text}>{text}</span>
    </div>
  )
}
