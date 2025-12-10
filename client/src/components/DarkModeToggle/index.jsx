import React, { useEffect } from 'react'
import styles from './index.module.less'
import SvgIcon from '../SvgIcon'
import { useUiStore } from '@/store'

const DarkModeToggle = () => {
  const theme = useUiStore((state) => state.theme)
  const setTheme = useUiStore((state) => state.setTheme)

  const applyTheme = (mode) => {
    const htmlElement = document.documentElement
    htmlElement.setAttribute('data-theme', mode)
  }

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (!theme) {
      setTheme(prefersDark ? 'dark' : 'light')
      applyTheme(prefersDark ? 'dark' : 'light')
    } else {
      applyTheme(theme)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (theme) {
      applyTheme(theme)
    }
  }, [theme])

  const toggleDarkMode = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  return (
    <div className={styles['dark-mode-toggle']} onClick={toggleDarkMode}>
      <div className={`${styles['toggle-container']} ${theme === 'dark' ? styles['dark'] : ''}`}>
        <div className={styles['toggle-slider']}>
          {theme === 'dark' ? (
            <SvgIcon iconName="icon-yueliang" />
          ) : (
            <SvgIcon iconName="icon-taiyang" />
          )}
        </div>
      </div>
    </div>
  )
}

export default DarkModeToggle