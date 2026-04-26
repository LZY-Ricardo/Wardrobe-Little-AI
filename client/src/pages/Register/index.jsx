import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from '@/api'
import styles from './index.module.less'
import logo from '@/assets/tlogin.png'
import { Button, Toast } from 'antd-mobile'
import { EyeInvisibleOutline, EyeOutline } from 'antd-mobile-icons'

const USERNAME_MIN_LENGTH = 6
const USERNAME_MAX_LENGTH = 32
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 64
const PASSWORD_RULE_MESSAGE = `密码需为 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 位，且包含大写字母、小写字母、数字和特殊字符`

const isStrongPassword = (value) =>
  /[a-z]/.test(value) &&
  /[A-Z]/.test(value) &&
  /\d/.test(value) &&
  /[^A-Za-z0-9]/.test(value) &&
  !/\s/.test(value)

export default function Register() {
  const navigate = useNavigate()
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    const normalizedUsername = username.trim()
    const normalizedPassword = password.trim()
    const normalizedConfirmPassword = confirmPassword.trim()

    if (!normalizedUsername) {
      Toast.show({
        content: '请输入用户名',
        position: 'center',
      })
      return
    }
    if (!normalizedPassword) {
      Toast.show({
        content: '请输入密码',
        position: 'center',
      })
      return
    }
    if (!normalizedConfirmPassword) {
      Toast.show({
        content: '请确认密码',
        position: 'center',
      })
      return
    }
    if (normalizedPassword !== normalizedConfirmPassword) {
      Toast.show({
        content: '两次输入的密码不一致',
        position: 'center',
      })
      return
    }
    if (normalizedUsername.length < USERNAME_MIN_LENGTH || normalizedUsername.length > USERNAME_MAX_LENGTH) {
      Toast.show({
        content: `用户名长度需为 ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} 位`,
        position: 'center',
      })
      return
    }
    if (normalizedPassword.length < PASSWORD_MIN_LENGTH || normalizedPassword.length > PASSWORD_MAX_LENGTH) {
      Toast.show({
        content: PASSWORD_RULE_MESSAGE,
        position: 'center',
      })
      return
    }
    if (!isStrongPassword(normalizedPassword)) {
      Toast.show({
        content: PASSWORD_RULE_MESSAGE,
        position: 'center',
      })
      return
    }

    try {
      setLoading(true)
      await axios.post('/user/register', {
        username: normalizedUsername,
        password: normalizedPassword,
      })
      Toast.show({
        content: '注册成功',
        position: 'center',
        duration: 1000,
      })
      setTimeout(() => {
        navigate('/login', {
          state: {
            username: normalizedUsername,
            password: normalizedPassword,
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
          <div className={styles.passwordInput}>
            <input
              className={styles.textInput}
              type={passwordVisible ? 'text' : 'password'}
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <div className={styles.eye} onClick={() => setPasswordVisible((value) => !value)}>
              {passwordVisible ? <EyeOutline /> : <EyeInvisibleOutline />}
            </div>
          </div>
          <div className={styles.passwordInput}>
            <input
              className={styles.textInput}
              type={confirmPasswordVisible ? 'text' : 'password'}
              placeholder="确认密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            <div className={styles.eye} onClick={() => setConfirmPasswordVisible((value) => !value)}>
              {confirmPasswordVisible ? <EyeOutline /> : <EyeInvisibleOutline />}
            </div>
          </div>
          <div className={styles.fieldHint}>{PASSWORD_RULE_MESSAGE}</div>
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
