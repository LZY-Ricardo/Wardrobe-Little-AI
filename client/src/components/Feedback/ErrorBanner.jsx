import React from 'react'
import styles from './index.module.less'

export default function ErrorBanner({ message = '出错了', actionText = '重试', onAction }) {
  return (
    <div className={styles.errorBanner}>
      <span className={styles.errorIcon}>!</span>
      <span className={styles.errorText}>{message}</span>
      {onAction ? (
        <button type="button" className={styles.actionBtn} onClick={onAction}>
          {actionText}
        </button>
      ) : null}
    </div>
  )
}
