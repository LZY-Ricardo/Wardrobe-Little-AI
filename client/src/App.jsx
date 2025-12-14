import { useLayoutEffect } from 'react'
import WrapperRouter from './router'
import { useUiStore } from '@/store'

function ThemeSync() {
  const theme = useUiStore((state) => state.theme)

  useLayoutEffect(() => {
    const nextTheme = theme === 'dark' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', nextTheme)
  }, [theme])

  return null
}

function App() {
  return (
    <>
      <ThemeSync />
      <WrapperRouter />
    </>
  )
}

export default App
