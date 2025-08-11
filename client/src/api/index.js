import axios from "axios";
import { Toast } from 'antd-mobile'


axios.defaults.baseURL = 'http://localhost:3000'
axios.defaults.headers['Content-Type'] = 'application/json'

// 请求拦截器
axios.interceptors.request.use(
    config => {
        const token = localStorage.getItem('access_token')
        if (token) {
            config.headers['Authorization'] = 'Bearer ' + token
        }
        return config
    },
    error => {
        return Promise.reject(error)
    }
)



// 响应拦截器
axios.interceptors.response.use(
    response => { // 状态为 200 走进这个回调函数
        if (response.status === 200) {
            if (response.data.code !== 1) { // 逻辑性错误
                Toast.show({
                    icon: 'fail',
                    content: response.data.msg,
                    duration: 1000
                })
                return Promise.reject(response)
            }
            return Promise.resolve(response.data)
        }
    },
    error => { // 状态码不是 200 走进这个回调函数
        if (error.response.status === 401) { // 短token已过期
            // console.log(error);
            if (error.response.data.code === 2) { // 未登录
                // console.log('未登录');
                Toast.show({
                    icon: 'fail',
                    content: '请先登录',
                    duration: 1000
                })
                setTimeout(() => {
                    window.location.href = '/login'
                }, 1000)
            }
            if (error.response.data.code === 0) { // 短token过期
                // console.log('短token过期');
                const originalRequest = error.config
                // 刷新token(长和短)
                return axios.post('/user/refresh_token', {
                    refresh_token: localStorage.getItem('refresh_token')
                }).then(res => {
                    // console.log('刷新token响应:', res);
                    if (res.code === 1) {
                        // console.log('刷新token成功');
                        localStorage.setItem('access_token', res.access_token)
                        localStorage.setItem('refresh_token', res.refresh_token)
                        // 更新原始请求的token头
                        originalRequest.headers['Authorization'] = 'Bearer ' + res.access_token
                        // 重新发送原始请求
                        return axios(originalRequest)
                    }
                })
            }
            if (error.response.data.code === 3) { // 长token也过期了
                // console.log('长token已过期');
                // 清除本地token
                localStorage.removeItem('access_token')
                localStorage.removeItem('refresh_token')
                // 跳转到登录页
                Toast.show({
                    icon: 'fail',
                    content: '登录失效',
                    duration: 1000
                })
                setTimeout(() => {
                    window.location.href = '/login'
                }, 1000)
            }
        }

        return Promise.reject(error)
    }
)

export default axios
