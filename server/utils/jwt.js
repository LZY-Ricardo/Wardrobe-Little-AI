const jwt = require('jsonwebtoken')

function sign(options, time = '24h') {
    return jwt.sign(options, 'lzy', {
        expiresIn: time // 不传时间 默认一天过期
    })
}

function verify() {
    return async (ctx, next) => {
        const authHeader = ctx.request.header.authorization
        console.log('Authorization头:', authHeader);
        if (authHeader) { // 登录过
            // 处理Bearer token格式
            const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
            try {
                let res = jwt.verify(token, 'lzy')
                console.log('短Token验证成功:', res);
                ctx.userId = res.id
                await next()
            } catch (error) { // 短token已过期
                console.error('短Token验证失败:', error.message);
                ctx.status = 401
                ctx.body = {
                    code: 0,
                    msg: '登录失效',
                    error: error.message
                }
            }
        } else { // 未登录
            console.log('未提供Authorization头即未登录账号');
            ctx.status = 401
            ctx.body = {
                code: 2,
                msg: '请先登录'
            }
        }
    }
}

function refreshToken(refresh_token) {
    if (!refresh_token) {
        console.error('刷新token为空');
        return null;
    }
    try {
        // 处理可能的Bearer前缀
        const token = refresh_token.startsWith('Bearer ') ? refresh_token.slice(7) : refresh_token;
        let res = jwt.verify(token, 'lzy');
        if (res.id) {   
            return res;
        }
        return null;
    } catch (error) {
        console.error('刷新token验证失败:', error.message);
        return null;
    }
}

module.exports = {
    sign,
    verify,
    refreshToken
}
