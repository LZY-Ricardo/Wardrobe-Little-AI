import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from '@/api'
import styles from './index.module.less'
import logo from '@/assets/tlogin.png'
import { Button, Toast } from 'antd-mobile'
import DarkModeToggle from '@/components/DarkModeToggle'

export default function Register() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    if (!username.trim()) {
      Toast.show({
        content: '请输入用户名',
        position: 'center',
      })
      return
    }
    if (!password.trim()) {
      Toast.show({
        content: '请输入密码',
        position: 'center',
      })
      return
    }
    if (!confirmPassword.trim()) {
      Toast.show({
        content: '请确认密码',
        position: 'center',
      })
      return
    }
    if (password !== confirmPassword) {
      Toast.show({
        content: '两次输入的密码不一致',
        position: 'center',
      })
      return
    }
    if (username.length < 6) {
      Toast.show({
        content: '用户名长度不能少于6位',
        position: 'center',
      })
      return
    }
    if (password.length < 6) {
      Toast.show({
        content: '密码长度不能少于6位',
        position: 'center',
      })
      return
    }

    try {
      setLoading(true)
      await axios.post('/user/register', {
        username,
        password,
      })
      Toast.show({
        content: '注册成功',
        position: 'center',
        duration: 1000,
      })
      setTimeout(() => {
        navigate('/login', {
          state: {
            username,
            password,
          },
        })
      }, 600)
    } catch {
      Toast.show({
        content: '注册失败，请稍后重试',
        position: 'center',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.register}>
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
            <div className={styles.subtitle}>创建你的账号</div>
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
          <input
            className={styles.textInput}
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <input
            className={styles.textInput}
            type="password"
            placeholder="确认密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        <Button block className={styles.primaryButton} loading={loading} onClick={handleRegister}>
          注册
        </Button>

        <div className={styles.footerText}>
          已经有账号？<span onClick={() => navigate('/login')}>立即登录</span>
        </div>
      </div>
    </div>
  )
}
