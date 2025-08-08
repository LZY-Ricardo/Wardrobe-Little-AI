import React, { useEffect, useState } from 'react'
import axios from '@/api'
import { Button } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'

export default function Home() {
  const [tokenInfo, setTokenInfo] = useState({
    accessToken: '',
    refreshToken: '',
    userInfo: null
  })
  const navigate = useNavigate()

  useEffect(() => {
    // 检查localStorage中的token
    const accessToken = localStorage.getItem('access_token')
    const refreshToken = localStorage.getItem('refresh_token')
    const userInfo = localStorage.getItem('userInfo')

    setTokenInfo({
      accessToken: accessToken || '未找到',
      refreshToken: refreshToken || '未找到',
      userInfo: userInfo ? JSON.parse(userInfo) : null
    })

    // 发送测试请求
    axios.post('/user/test').then(res => {
      console.log('请求成功:', res.data);
    }).catch(err => {
      console.error('请求失败:', err);
    })
  }, [])

  const goToLogin = () => {
    navigate('/login')
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2>首页</h2>
      <div style={{ marginBottom: '20px' }}>
        <h3>Token信息（调试用）:</h3>
        <p>Access Token: {tokenInfo.accessToken}</p>
        <p>Refresh Token: {tokenInfo.refreshToken}</p>
        <p>用户信息: {tokenInfo.userInfo ? JSON.stringify(tokenInfo.userInfo) : '未找到'}</p>
      </div>
      <Button color='primary' onClick={goToLogin}>去登录</Button>
    </div>
  )
}
