const Router = require('@koa/router')
const router = new Router()
const {
    userLogin,
    userRegister,
    checkUsername,
    uploadPhoto,
    uploadAvatar,
    getUserInfoById,
    updateUserName,
    updateSex,
    updatePassword,
} = require('../controllers/user')

// const fs = require('fs')  // 不再需要文件系统操作
// const path = require('path')  // 不再需要路径操作

const { sign, verify, refreshToken } = require('../utils/jwt')
const { escape } = require('../utils/security')


router.prefix('/user')

// 用户登录
router.post('/login', async (ctx) => {
    let { username, password } = ctx.request.body
    username = escape(username)
    password = escape(password)
    try {
        let res = await userLogin(username, password)
        console.log(res);
        if (res) {
            // JWT payload 只包含必要的用户信息，避免 token 过大
            let jwtPayload = {
                username: res.username,
                id: res.id,
                createTime: res.create_time,
            }
            const access_token = sign(jwtPayload, '1h') // 短token
            const refresh_token = sign(jwtPayload, '7d') // 长token
            
            // 返回给前端的完整数据
            let data = {
                username: res.username,
                id: res.id,
                createTime: res.create_time,
                sex: res.sex,
                characterModel: res.characterModel,
                avatar: res.avatar,
                access_token,
                refresh_token,
            }
            ctx.body = {
                code: 1,
                msg: '登录成功',
                data,
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

// 用户注册
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

// upload character model (base64 data url -> save file -> store relative url in DB)
router.post('/uploadPhoto', verify(), async (ctx) => {
  try {
    if (!ctx.request.body || !ctx.request.body.image) {
      ctx.status = 400
      ctx.body = {
        code: 0,
        msg: '\u8bf7\u63d0\u4f9b\u56fe\u7247\u6570\u636e',
      }
      return
    }

    const imageData = ctx.request.body.image
    const id = ctx.userId

    let prevModelUrl = ''
    try {
      const user = await getUserInfoById(id)
      prevModelUrl = user?.characterModel || ''
    } catch (e) {
      prevModelUrl = ''
    }

    if (!imageData.startsWith('data:image/')) {
      ctx.status = 400
      ctx.body = {
        code: 0,
        msg: '\u65e0\u6548\u7684\u56fe\u7247\u6570\u636e\u683c\u5f0f',
      }
      return
    }

    const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!matches) {
      ctx.status = 400
      ctx.body = {
        code: 0,
        msg: '\u65e0\u6548\u7684base64\u56fe\u7247\u683c\u5f0f',
      }
      return
    }

    const fileType = (matches[1] || '').toLowerCase()
    const base64Data = matches[2] || ''

    const allowedTypes = ['jpeg', 'jpg', 'png', 'webp']
    if (!allowedTypes.includes(fileType)) {
      ctx.status = 400
      ctx.body = {
        code: 0,
        msg: '\u4e0d\u652f\u6301\u7684\u56fe\u7247\u7c7b\u578b',
      }
      return
    }

    const buffer = Buffer.from(base64Data, 'base64')
    if (buffer.length > 5 * 1024 * 1024) {
      ctx.status = 400
      ctx.body = {
        code: 0,
        msg: '\u56fe\u7247\u5927\u5c0f\u4e0d\u80fd\u8d85\u8fc75MB',
      }
      return
    }

    // 直接存储 Base64 数据到数据库，不再保存文件
    const modelBase64 = `data:image/${fileType};base64,${base64Data}`

    let result = false
    try {
      result = await uploadPhoto(modelBase64, id)
    } catch (error) {
      // 不再需要删除文件（因为没有创建文件）
      throw error
    }

    if (result) {
      // 不再需要删除旧文件（因为数据在数据库中）
      ctx.body = {
        code: 1,
        msg: '\u4eba\u7269\u6a21\u7279\u4e0a\u4f20\u6210\u529f',
        data: { characterModel: modelBase64 },
      }
      return
    }

    // 如果上传失败，不需要清理文件
    ctx.status = 500
    ctx.body = {
      code: 0,
      msg: '\u4eba\u7269\u6a21\u7279\u4e0a\u4f20\u5931\u8d25',
    }
  } catch (error) {
    if (error?.code === 'ER_BAD_FIELD_ERROR') {
      ctx.status = 500
      ctx.body = {
        code: 0,
        msg:
          '\u6570\u636e\u5e93\u7f3a\u5c11 characterModel \u5b57\u6bb5\uff0c\u8bf7\u5148\u6267\u884c: ALTER TABLE user ADD COLUMN characterModel TEXT NULL;',
      }
      return
    }

    console.error('upload character model error:', error)
    ctx.status = 500
    ctx.body = {
      code: -1,
      msg: '\u4eba\u7269\u6a21\u7279\u4e0a\u4f20\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5',
      error: error.message,
    }
  }
})

router.delete('/characterModel', verify(), async (ctx) => {
  const id = ctx.userId
  try {
    let prevModelUrl = ''
    try {
      const user = await getUserInfoById(id)
      prevModelUrl = user?.characterModel || ''
    } catch (e) {
      prevModelUrl = ''
    }

    if (!prevModelUrl) {
      ctx.body = {
        code: 1,
        msg: '\u5f53\u524d\u65e0\u4eba\u7269\u6a21\u7279',
        data: { deleted: false },
      }
      return
    }

    // 不再需要删除文件（因为数据存储在数据库中）
    const result = await uploadPhoto(null, id)
    if (result) {
      ctx.body = {
        code: 1,
        msg: '\u4eba\u7269\u6a21\u7279\u5df2\u5220\u9664',
        data: { deleted: true },
      }
      return
    }

    ctx.status = 500
    ctx.body = {
      code: 0,
      msg: '\u4eba\u7269\u6a21\u7279\u5220\u9664\u5931\u8d25',
    }
  } catch (error) {
    if (error?.code === 'ER_BAD_FIELD_ERROR') {
      ctx.status = 500
      ctx.body = {
        code: 0,
        msg:
          '\u6570\u636e\u5e93\u7f3a\u5c11 characterModel \u5b57\u6bb5\uff0c\u8bf7\u5148\u6267\u884c: ALTER TABLE user ADD COLUMN characterModel TEXT NULL;',
      }
      return
    }

    console.error('delete character model error:', error)
    ctx.status = 500
    ctx.body = {
      code: -1,
      msg: '\u5220\u9664\u4eba\u7269\u6a21\u7279\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5',
      error: error.message,
    }
  }
})

// 获取用户信息
// upload avatar (base64 data url -> save file -> store relative url in DB)
router.post('/uploadAvatar', verify(), async (ctx) => {
  try {
    if (!ctx.request.body || !ctx.request.body.image) {
      ctx.status = 400
      ctx.body = {
        code: 0,
        msg: '\u8bf7\u63d0\u4f9b\u5934\u50cf\u56fe\u7247\u6570\u636e',
      }
      return
    }

    const imageData = ctx.request.body.image
    const id = ctx.userId

    let prevAvatarUrl = ''
    try {
      const user = await getUserInfoById(id)
      prevAvatarUrl = user?.avatar || ''
    } catch (e) {
      prevAvatarUrl = ''
    }

    if (!imageData.startsWith('data:image/')) {
      ctx.status = 400
      ctx.body = {
        code: 0,
        msg: '\u65e0\u6548\u7684\u56fe\u7247\u6570\u636e\u683c\u5f0f',
      }
      return
    }

    const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!matches) {
      ctx.status = 400
      ctx.body = {
        code: 0,
        msg: '\u65e0\u6548\u7684base64\u56fe\u7247\u683c\u5f0f',
      }
      return
    }

    const fileType = (matches[1] || '').toLowerCase()
    const base64Data = matches[2] || ''

    const allowedTypes = ['jpeg', 'jpg', 'png', 'webp']
    if (!allowedTypes.includes(fileType)) {
      ctx.status = 400
      ctx.body = {
        code: 0,
        msg: '\u4e0d\u652f\u6301\u7684\u56fe\u7247\u7c7b\u578b',
      }
      return
    }

    const buffer = Buffer.from(base64Data, 'base64')
    if (buffer.length > 2 * 1024 * 1024) {
      ctx.status = 400
      ctx.body = {
        code: 0,
        msg: '\u5934\u50cf\u56fe\u7247\u4e0d\u80fd\u8d85\u8fc72MB',
      }
      return
    }

    // 直接存储 Base64 数据到数据库，不再保存文件
    const avatarBase64 = `data:image/${fileType};base64,${base64Data}`

    let result = false
    try {
      result = await uploadAvatar(avatarBase64, id)
    } catch (error) {
      // 不再需要删除文件（因为没有创建文件）
      throw error
    }

    if (result) {
      // 不再需要删除旧文件（因为数据在数据库中）
      ctx.body = {
        code: 1,
        msg: '\u5934\u50cf\u4e0a\u4f20\u6210\u529f',
        data: { avatar: avatarBase64 },
      }
      return
    }

    // 如果上传失败，不需要清理文件
    ctx.status = 500
    ctx.body = {
      code: 0,
      msg: '\u5934\u50cf\u4e0a\u4f20\u5931\u8d25',
    }
  } catch (error) {
    if (error?.code === 'ER_BAD_FIELD_ERROR') {
      ctx.status = 500
      ctx.body = {
        code: 0,
        msg:
          '\u6570\u636e\u5e93\u7f3a\u5c11 avatar \u5b57\u6bb5\uff0c\u8bf7\u5148\u6267\u884c: ALTER TABLE user ADD COLUMN avatar VARCHAR(255) NULL;',
      }
      return
    }

    console.error('upload avatar error:', error)
    ctx.status = 500
    ctx.body = {
      code: -1,
      msg: '\u5934\u50cf\u4e0a\u4f20\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5',
      error: error.message,
    }
  }
})

router.get('/getUserInfo', verify(), async (ctx) => {
    const user_id = ctx.userId
    try {
        const res = await getUserInfoById(user_id)
        if (res) {
            const { password, ...safeUser } = res
            ctx.body = {
                code: 1,
                msg: '获取成功',
                data: safeUser,
            }
        } else {
            ctx.body = {
                code: 0,
                msg: '获取失败',
            }
        }
    } catch (error) {
        ctx.body = {
            code: -1,
            msg: '获取失败',
            error: error.message,
        }
    }
})

// 修改用户昵称
router.put('/updateUserName', verify(), async (ctx) => {
    const id = ctx.userId
    const { name } = ctx.request.body
    try {
        const res = await updateUserName(id, name)
        if (res) {
            ctx.body = {
                code: 1,
                msg: '修改成功',
                data: res,
            }
        } else {
            ctx.body = {
                code: 0,
                msg: '修改失败',
            }
        }
    } catch (error) {
        ctx.body = {
            code: -1,
            msg: '修改失败',
            error: error.message,
        }
    }
})

// 修改用户性别
router.put('/updateSex', verify(), async (ctx) => {
    console.log(1);
    
    const id = ctx.userId
    const { sex } = ctx.request.body
    console.log(ctx.request.body);
    
    try {
        const res = await updateSex(id, sex)
        if (res) {
            ctx.body = {
                code: 1,
                msg: '修改性别成功',
                data: res,
            }
        } else {
            ctx.body = {
                code: 0,
                msg: '修改性别失败',
            }
        }
    } catch (error) {
        ctx.body = {
            code: -1,
            msg: '修改性别失败',
            error: error.message,
        }
    }
})

// 修改密码
router.put('/updatePassword', verify(), async (ctx) => {
    const id = ctx.userId
    const { oldPassword, newPassword } = ctx.request.body
    try {
        const res = await updatePassword(id, oldPassword, newPassword)
        if (res) {
            ctx.body = {
                code: 1,
                msg: '修改密码成功',
                data: res,
            }
        } else {
            ctx.body = {
                code: 0,
                msg: '修改密码失败,请检查您的密码是否正确',
            }
        }
    } catch (error) {
        ctx.body = {
            code: -1,
            msg: '修改密码失败',
            error: error.message,
        }
    }
})

module.exports = router
