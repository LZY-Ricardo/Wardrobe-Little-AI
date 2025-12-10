import React from 'react'
import styles from './index.module.less'

export default function Empty({ description = '暂无数据', actionText, onAction }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>⌀</div>
      <div className={styles.emptyText}>{description}</div>
      {actionText && onAction ? (
        <button type="button" className={styles.actionBtn} onClick={onAction}>
          {actionText}
        </button>
      ) : null}
    </div>
  )
}
