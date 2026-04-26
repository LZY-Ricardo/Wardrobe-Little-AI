import React from 'react'
import {
  buildConfirmationItems,
  buildConfirmationPreviewImages,
  formatConfirmationScope,
  getConfirmationTitle,
} from './viewModels'

export default function PendingConfirmationCard({
  pendingConfirmation,
  sending,
  onCancel,
  onConfirm,
  styles,
}) {
  if (!pendingConfirmation) return null

  const { fields, items } = buildConfirmationItems(pendingConfirmation)
  const previewImages = buildConfirmationPreviewImages(pendingConfirmation)

  return (
    <div className={styles.confirmCard}>
      <div className={styles.confirmBadge}>待确认</div>
      <div className={styles.confirmTitle}>{getConfirmationTitle(pendingConfirmation)}</div>
      {pendingConfirmation.summary ? <div className={styles.confirmText}>{pendingConfirmation.summary}</div> : null}
      {pendingConfirmation.scope ? (
        <div className={styles.confirmMetaRow}>
          <span className={styles.confirmMetaLabel}>影响范围</span>
          <span className={styles.confirmMetaValue}>{formatConfirmationScope(pendingConfirmation.scope)}</span>
        </div>
      ) : null}
      {pendingConfirmation.targetPage?.label ? (
        <div className={styles.confirmMetaRow}>
          <span className={styles.confirmMetaLabel}>相关页面</span>
          <span className={styles.confirmMetaValue}>{pendingConfirmation.targetPage.label}</span>
        </div>
      ) : null}
      {previewImages.length ? (
        <div className={styles.confirmPreviewGrid} data-count={previewImages.length}>
          {previewImages.map((item, index) => (
            <img
              key={`${item.dataUrl}-${index}`}
              src={item.dataUrl}
              alt={item.name || '待确认图片'}
              className={styles.confirmPreviewImage}
            />
          ))}
        </div>
      ) : null}
      {pendingConfirmation.details ? (
        <div className={styles.confirmDetails}>
          {fields.map((item) => (
            <div key={item.key} className={styles.confirmDetailRow}>
              <span className={styles.confirmDetailLabel}>{item.label}</span>
              <span className={styles.confirmDetailValue}>{item.value}</span>
            </div>
          ))}
          {items.length ? (
            <div className={styles.confirmDetailList}>
              {items.map((item) => (
                <div key={item.id} className={styles.confirmDetailItem}>
                  <div className={styles.confirmDetailItemTitle}>{item.title}</div>
                  {item.lines.map((line) => (
                    <div key={line} className={styles.confirmDetailItemLine}>{line}</div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {pendingConfirmation.risk ? (
        <div className={styles.confirmRiskBlock}>
          <div className={styles.confirmRiskLabel}>风险提示</div>
          <div className={styles.confirmRiskText}>{pendingConfirmation.risk}</div>
        </div>
      ) : null}
      <div className={styles.confirmActions}>
        <button type="button" className={styles.secondaryAction} onClick={onCancel} disabled={sending}>
          取消
        </button>
        <button type="button" className={styles.primaryAction} onClick={onConfirm} disabled={sending}>
          确认执行
        </button>
      </div>
    </div>
  )
}
