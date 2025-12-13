import { useLocation, useNavigate } from 'react-router-dom'
import SvgIcon from '@/components/SvgIcon'
import styles from './index.module.less'

const HIDDEN_PATH_PREFIXES = ['/aichat']

export default function AiChatEntrance() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  if (HIDDEN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null

  return (
    <button
      type="button"
      className={styles['entrance']}
      aria-label="打开 AI 助手"
      onClick={() => navigate('/aichat')}
    >
      <SvgIcon iconName="icon-zhinengkefu" className={styles['entrance-icon']} />
      <span className={styles['entrance-text']}>AI 助手</span>
    </button>
  )
}

