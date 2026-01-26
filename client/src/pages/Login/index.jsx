import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from '@/api'
import styles from './index.module.less'
import logo from '@/assets/tlogin.png'
import { Button, Toast } from 'antd-mobile'
import { EyeInvisibleOutline, EyeOutline } from 'antd-mobile-icons'
import DarkModeToggle from '@/components/DarkModeToggle'
import { useAuthStore } from '@/store'

export default function Login() {
  const [visible, setVisible] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { state } = useLocation()
  const navigate = useNavigate()
  const setTokens = useAuthStore((s) => s.setTokens)
  const setUserInfo = useAuthStore((s) => s.setUserInfo)

  useEffect(() => {
    if (state?.username) {
      setUsername(state.username)
      setPassword(state.password || '')
    }
  }, [state])

  const onLogin = async () => {
    if (!username) {
      Toast.show({ content: '请输入用户名', duration: 1000 })
      return
    }
    if (!password) {
      Toast.show({ content: '请输入密码', duration: 1000 })
      return
    }
    try {
      const res = await axios.post('/user/login', { username, password })
      const { access_token, refresh_token, id, createTime, sex, characterModel, avatar } = res.data || {}
      setTokens({ accessToken: access_token, refreshToken: refresh_token })
      localStorage.setItem('access_token', access_token)
      localStorage.setItem('refresh_token', refresh_token)
      const userInfo = {
        username,
        id,
        createTime,
        sex,
        avatar,
        hasCharacterModel: Boolean(characterModel),
      }
      setUserInfo(userInfo)
      const value = JSON.stringify(userInfo)
      try {
        localStorage.setItem('userInfo', value)
      } catch {
        try {
          localStorage.removeItem('userInfo')
          localStorage.setItem('userInfo', value)
        } catch (retryError) {
          console.warn('persist userInfo failed:', retryError)
        }
      }

      const redirectPath = state?.redirect || '/'
      Toast.show({ content: '登录成功', duration: 1000 })
      setTimeout(() => {
        navigate(redirectPath, { replace: true })
      }, 800)
    } catch (error) {
      console.error('登录失败:', error)
      Toast.show({ content: '登录失败，请检查用户名和密码', duration: 2000 })
    }
  }

  return (
    <div className={styles.login}>
      <div className={styles['dark-mode-container']}>
        <DarkModeToggle />
      </div>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logoWrap}>
            <img src={logo} alt="logo" />
          </div>
          <div className={styles.titleGroup}>
            <div className={styles.appName}>衣橱小AI</div>
            <div className={styles.subtitle}>欢迎回来</div>
          </div>
        </div>

        <div className={styles.form}>
          <input
            className={styles.textInput}
            type="text"
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
          />
          <div className={styles.passwordInput}>
            <input
              className={styles.textInput}
              type={visible ? 'text' : 'password'}
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <div className={styles.eye} onClick={() => setVisible(!visible)}>
              {visible ? <EyeOutline /> : <EyeInvisibleOutline />}
            </div>
          </div>
        </div>

        <Button block className={styles.primaryButton} onClick={onLogin}>
          登录
        </Button>

        <div className={styles.footerText}>
          还没有账号？<span onClick={() => navigate('/register')}>立即注册</span>
        </div>
      </div>
    </div>
  )
}
