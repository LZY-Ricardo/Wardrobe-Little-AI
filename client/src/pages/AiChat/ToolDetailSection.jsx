import React from 'react'
import {
  buildToolCallTimeline,
  buildToolSummaryList,
  getToolStatusLabel,
} from './viewModels'

export default function ToolDetailSection({
  message,
  expanded,
  onToggle,
  styles,
}) {
  const toolTimeline = buildToolCallTimeline(message)
  const toolSummaryList = buildToolSummaryList(message)

  if (!toolTimeline.length && !toolSummaryList.length) return null

  return (
    <div className={styles.toolDetailBlock}>
      <button type="button" className={styles.toolToggleBtn} onClick={onToggle}>
        {expanded ? '收起工具调用记录 ▴' : '工具调用记录 ▾'}
      </button>
      {expanded ? (
        <>
          {toolTimeline.length ? (
            <div className={styles.toolTimeline}>
              {toolTimeline.map((toolItem) => (
                <div
                  key={toolItem.id}
                  className={`${styles.toolChip} ${
                    toolItem.status === 'success'
                      ? styles.toolChipSuccess
                      : toolItem.status === 'failed'
                        ? styles.toolChipFailed
                        : toolItem.status === 'staged'
                          ? styles.toolChipStaged
                          : styles.toolChipRunning
                  }`}
                >
                  <span className={styles.toolChipLabel}>{toolItem.label}</span>
                  {!toolItem.isPhase ? <span className={styles.toolChipStatus}>{getToolStatusLabel(toolItem.status)}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
          {toolSummaryList.length ? (
            <div className={styles.toolSummaryCard}>
              <div className={styles.toolSummaryTitle}>执行结果</div>
              <div className={styles.toolSummaryList}>
                {toolSummaryList.map((item, index) => (
                  <div key={`${message.id}-summary-${index}`} className={styles.toolSummaryItem}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
