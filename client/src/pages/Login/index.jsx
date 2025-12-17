import React, { useEffect, useState } from 'react'
import styles from './index.module.less'
import logo from '@/assets/tlogin.png'
import { Form, Input, Button, Toast } from 'antd-mobile'
import { EyeInvisibleOutline, EyeOutline, UserOutline, LockOutline } from 'antd-mobile-icons'
import { useNavigate, useLocation } from 'react-router-dom'
import DarkModeToggle from '@/components/DarkModeToggle'
import axios from '@/api'
import { useAuthStore } from '@/store'

export default function Login() {
  const [visible, setVisible] = useState(false)
  const { state } = useLocation()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const setTokens = useAuthStore((s) => s.setTokens)
  const setUserInfo = useAuthStore((s) => s.setUserInfo)

  useEffect(() => {
    form.resetFields()
    if (state?.username) {
      form.setFieldsValue({
        username: state.username,
        password: state.password,
      })
    }
  }, [state, form])

  const onLogin = async () => {
    const values = form.getFieldsValue()
    const { username, password } = values
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

        <Form layout="vertical" className={styles.form} form={form} autoComplete="off">
          <Form.Item name="username" rules={[{ message: '请输入用户名' }]} className={styles.formItem}>
            <Input
              className={styles.textInput}
              placeholder="用户名"
              clearable
              autoComplete="off"
              prefix={<UserOutline />}
            />
          </Form.Item>
          <Form.Item name="password" rules={[{ message: '请输入密码' }]} className={styles.formItem}>
            <Input
              className={styles.textInput}
              placeholder="密码"
              clearable
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              prefix={<LockOutline />}
              suffix={
                <div className={styles.eye}>
                  {visible ? (
                    <EyeOutline onClick={() => setVisible(false)} />
                  ) : (
                    <EyeInvisibleOutline onClick={() => setVisible(true)} />
                  )}
                </div>
              }
            />
          </Form.Item>
        </Form>

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
