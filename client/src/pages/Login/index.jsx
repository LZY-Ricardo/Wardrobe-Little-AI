import React, { useState, useEffect } from 'react'
import styles from './index.module.less'
import logo from '@/assets/tlogin.png'
import { Form, Input, Button, Toast } from 'antd-mobile'
import { EyeInvisibleOutline, EyeOutline } from 'antd-mobile-icons'
import { useNavigate, useLocation } from 'react-router-dom'
import DarkModeToggle from '@/components/DarkModeToggle'
import axios from '@/api'



export default function Login() {
  const [visible, setVisible] = useState(false)
  const { state } = useLocation()
  const navigate = useNavigate()
  const [form] = Form.useForm() // 使用Form.useForm创建表单实例
  

  useEffect(() => {
    // 组件挂载时重置表单
    form.resetFields();
    
    // 如果有从其他页面传递过来的state数据，则填充表单
    if (state?.username) {
      console.log('设置表单值:', state);
      form.setFieldsValue({
        username: state.username,
        password: state.password
      })
    }
  }, [state])

  

  const onLogin = async () => {
    // 获取表单所有字段值
    const values = form.getFieldsValue()
    const {username, password} = values
    if(!username){
      Toast.show({
                content: '请输入用户名',
                duration: 1000
              })
      return
    }
    if(!password){
      Toast.show({
                content: '请输入密码',
                duration: 1000
              })
      return
    }
    try {
      const res = await axios.post('/user/login', {username, password})
      console.log('登录响应:', res);
      
      // 存储token和用户信息
      localStorage.setItem('access_token', res.data.access_token)
      localStorage.setItem('refresh_token', res.data.refresh_token)
      
      // 存储用户信息，移除token避免重复存储
      const userInfo = {
        username: res.data.username,
        id: res.data.id,
        createTime: res.data.createTime,
        sex: res.data.sex,
        characterModel: res.data.characterModel,
      }
      localStorage.setItem('userInfo', JSON.stringify(userInfo))
      
      Toast.show({
        content: '登录成功',
        duration: 1000
      })
      
      setTimeout(() => {
        navigate('/')
      }, 1000)
    } catch (error) {
      console.error('登录失败:', error);
      Toast.show({
        content: '登录失败，请检查用户名和密码',
        duration: 2000
      })
    }
    
  }
  return (
    <div className={styles.login}>
      <div className={styles['dark-mode-container']}>
        <DarkModeToggle />
      </div>
      <div className={styles.loginLogo}>
        <img src={logo} alt="" />
      </div>
      <div className={styles.loginBox}>
        <Form
          layout='horizontal'
          className={styles.loginForm}
          form={form} // 绑定表单实例
          autoComplete="off" // 禁用整个表单的自动填充
        >
          <Form.Item 
            label='用户名' 
            name='username'
            rules={[{ message: '请输入用户名' }]}
          >
            <Input 
              placeholder='请输入用户名' 
              clearable={true} 
              autoComplete="off" // 禁用浏览器自动填充
            />
          </Form.Item>
          <Form.Item
            label='密码'
            name='password'
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
              placeholder='请输入密码'
              clearable={true}
              type={visible ? 'text' : 'password'}
              autoComplete="new-password" // 使用new-password值可以更有效地阻止浏览器自动填充
            />
          </Form.Item>
        </Form>
        <Button
          type='primary'
          color='primary'
          block 
          className={styles.loginBtn}
          onClick={onLogin} 
        >
          登录
        </Button>

      </div>
      <div className={styles.register}>
        还没有账号？<p onClick={() => navigate('/register')}>立即注册</p>
      </div>
    </div>
  )
}
