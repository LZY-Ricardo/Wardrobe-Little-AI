const Router = require('@koa/router')
const router = new Router()
const { userLogin, userRegister, checkUsername } = require('../controllers/user')
const { sign, verify, refreshToken } = require('../utils/jwt')
const { escape } = require('../utils/security')


router.prefix('/user')

router.post('/login', async (ctx) => {
    let { username, password } = ctx.request.body
    username = escape(username)
    password = escape(password)
    try {
        let res = await userLogin(username, password)
        if (res) {
            let data = {
                username: res.username,
                id: res.id,
                createTime: res.create_time
            }
            const access_token = sign(data, '1h') // 短token
            const refresh_token = sign(data, '7d') // 长token
            ctx.body = {
                code: 1,
                msg: '登录成功',
                username: res.username,
                id: res.id,
                createTime: res.create_time,
                access_token,
                refresh_token
            }
        } else {
            ctx.body = {
                code: 0,
                msg: '用户名或密码错误'
            }
        }
    } catch (error) {
        ctx.body = {
            code: -1,
            msg: '登录失败',
            error: error.message
        }
    }
})

router.post('/register', async (ctx) => {
    let { username, password } = ctx.request.body
    username = escape(username)
    password = escape(password)
    try {
        let res = await checkUsername(username)
        if (res) {
            ctx.body = {
                code: 0,
                msg: '用户名已存在'
            }
        } else {
            let data = {
                username,
                password,
                create_time: Date.now()
            }
            let res = await userRegister(data)
            if (res) {
                ctx.body = {
                    code: 1,
                    msg: '注册成功'
                }
            } else {
                ctx.body = {
                    code: 0,
                    msg: '注册失败'
                }
            }
        }
    } catch (error) {
        ctx.body = {
            code: -1,
            msg: '注册失败',
            error: error.message
        }
    }
})

router.post('/test',verify(), async (ctx) => {
    console.log('测试成功');
    ctx.body = {
        code: 1,
        msg: '测试成功'
    }
})

router.post('/refresh_token', async (ctx) => {
    const { refresh_token } = ctx.request.body
    console.log('收到刷新token请求:', refresh_token ? '有刷新token' : '无刷新token');
    let decoded = refreshToken(refresh_token)
    if (decoded) {
        let data = {
            id: decoded.id,
            username: decoded.username,
            createTime: decoded.createTime
        }
        const access_token = sign(data, '1h')
        const new_refresh_token = sign(data, '7d')
        console.log('刷新成功');
        ctx.body = {
            code: 1,
            msg: '刷新成功',
            access_token,
            refresh_token: new_refresh_token
        }
    } else { // 长token也过期了或无效
        console.log('刷新token失败：长token无效或已过期');
        ctx.status = 401
        ctx.body = {
            code: 3,
            msg: '登录已过期，请重新登录'
        }
    }
})


module.exports = router
