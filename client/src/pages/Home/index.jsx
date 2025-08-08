import React, { useEffect, useState } from 'react'
import axios from '@/api'
import { Button } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'

export default function Home() {

  // useEffect(() => {
  //   // 发送测试请求
  //   axios.post('/user/test').then(res => {
  //     console.log('请求成功:', res);
  //   }).catch(err => {
  //     console.error('请求失败:', err);
  //   })
  // }, [])


  return (
    <div className='home'>

      <div className='body'>
        <div className='header'>
          <div className='header-title'>首页</div>
          <div className='header-weather'></div>
        </div>
        <div className='content'>

        </div>
      </div>

      <div className='bottom-navigation-bar'>

      </div>

    </div>
  )
}
