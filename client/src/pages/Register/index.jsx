import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from '@/api'
import styles from './index.module.less'
import logo from '@/assets/tlogin.png'
import { Input, Button, Toast } from 'antd-mobile'
import DarkModeToggle from '@/components/DarkModeToggle'


export default function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    // 表单验证
    if (!username.trim()) {
      Toast.show({
        content: '请输入用户名',
        position: 'center',
      });
      return;
    }
    if (!password.trim()) {
      Toast.show({
        content: '请输入密码',
        position: 'center',
      });
      return;
    }
    if (!confirmPassword.trim()) {
      Toast.show({
        content: '请确认密码',
        position: 'center',
      });
      return;
    }
    if (password !== confirmPassword) {
      Toast.show({
        content: '两次输入的密码不一致',
        position: 'center',
      });
      return;
    }
    if (username.length < 6) {
      Toast.show({
        content: '用户名长度不能小于6位',
        position: 'center',
      });
      return;
    }
    if (password.length < 6) {
      Toast.show({
        content: '密码长度不能小于6位',
        position: 'center',
      });
      return;
    }


    setLoading(true);
    await axios.post('/user/register', {
      username,
      password
    });
    Toast.show({
      content: '注册成功',
      position: 'center',
      duration: 1000
    });
    setTimeout(() => {
      // 注册成功后跳转到登录页
      navigate('/login', {
        state: {
          username,
          password
        }
      });
    }, 1000)
    setLoading(false);
  };

  return (
    <div className={styles.register}>
      <div className={styles['dark-mode-container']}>
        <DarkModeToggle />
      </div>
      <div className={styles.registerBox}>
        <div className={styles.registerLogo}>
          <img src={logo} alt="" />
        </div>
        <div className={styles.title}>注册账号</div>
        <div className={styles.registerForm}>
          <div className={styles.registerFormItem}>
            <div className={styles.registerFormItemLabel}>用户名</div>
            <div className={styles.registerFormItemInput}>
              <Input
                placeholder='请输入用户名'
                clearable={true}
                value={username}
                onChange={val => setUsername(val)}
              />
            </div>
          </div>
          <div className={styles.registerFormItem}>
            <div className={styles.registerFormItemLabel}>密码</div>
            <div className={styles.registerFormItemInput}>
              <Input
                placeholder='请输入密码'
                clearable={true}
                type="password"
                value={password}
                onChange={val => setPassword(val)}
              />
            </div>
          </div>
          <div className={styles.registerFormItem}>
            <div className={styles.registerFormItemLabel}>确认密码</div>
            <div className={styles.registerFormItemInput}>
              <Input
                placeholder='请再次输入密码'
                clearable={true}
                type="password"
                value={confirmPassword}
                onChange={val => setConfirmPassword(val)}
              />
            </div>
          </div>
        </div>
        <Button
          color='primary'
          block
          loading={loading}
          onClick={handleRegister}
        >注册</Button>

        <div className={styles.registerLogin}>
          已经有账号？<p onClick={() => navigate('/login')}>立即登录</p>
        </div>
      </div>
    </div>
  )
}
