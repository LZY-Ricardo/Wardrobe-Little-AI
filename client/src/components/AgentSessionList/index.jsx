import styles from './index.module.less'

export default function AgentSessionList({ sessions = [], activeSessionId, onSelect, onCreate }) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.title}>会话</div>
        <button type="button" className={styles.createButton} onClick={onCreate}>
          新建
        </button>
      </div>
      <div className={styles.list}>
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            className={`${styles.item} ${session.id === activeSessionId ? styles.itemActive : ''}`}
            onClick={() => onSelect(session)}
          >
            <strong>{session.title || '未命名会话'}</strong>
            <span>{session.current_task_type || 'chat'}</span>
            {session.last_message_preview ? <span>{session.last_message_preview}</span> : null}
            <span>{new Date(session.last_message_at).toLocaleString()}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
