import React, { useEffect, useState } from 'react'
import styles from './index.module.less'
import logo from '@/assets/tlogin.png'
import { Form, Input, Button, Toast } from 'antd-mobile'
import { EyeInvisibleOutline, EyeOutline } from 'antd-mobile-icons'
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
      const { access_token, refresh_token, id, createTime, sex, characterModel } = res.data || {}
      setTokens({ accessToken: access_token, refreshToken: refresh_token })
      localStorage.setItem('access_token', access_token)
      localStorage.setItem('refresh_token', refresh_token)
      const userInfo = { username, id, createTime, sex, characterModel }
      setUserInfo(userInfo)
      localStorage.setItem('userInfo', JSON.stringify(userInfo))

      Toast.show({ content: '登录成功', duration: 1000 })
      setTimeout(() => {
        navigate('/')
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
      <div className={styles.loginLogo}>
        <img src={logo} alt="logo" />
      </div>
      <div className={styles.loginBox}>
        <Form layout="horizontal" className={styles.loginForm} form={form} autoComplete="off">
          <Form.Item label="用户名" name="username" rules={[{ message: '请输入用户名' }]}>
            <Input placeholder="请输入用户名" clearable autoComplete="off" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ message: '请输入密码' }]}
            extra={
              <div className={styles.eye}>
                {!visible ? (
                  <EyeInvisibleOutline onClick={() => setVisible(true)} />
                ) : (
                  <EyeOutline onClick={() => setVisible(false)} />
                )}
              </div>
            }
          >
            <Input
              placeholder="请输入密码"
              clearable
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
            />
          </Form.Item>
        </Form>
        <Button type="primary" color="primary" block className={styles.loginBtn} onClick={onLogin}>
          登录
        </Button>
      </div>
      <div className={styles.register}>
        还没有账号？<p onClick={() => navigate('/register')}>立即注册</p>
      </div>
    </div>
  )
}