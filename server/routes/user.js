const Router = require('@koa/router')
const router = new Router()
const { userLogin, userRegister, checkUsername, uploadPhoto, getUserInfoById, updateUserName } = require('../controllers/user')


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

// 上传全身照
router.post('/uploadPhoto', verify(), async (ctx) => {
  try {
    // 检查是否有图片数据
    if (!ctx.request.body || !ctx.request.body.image) {
      ctx.status = 400;
      ctx.body = {
        code: 0,
        msg: '请提供图片数据'
      };
      return;
    }

    const imageData = ctx.request.body.image;
    const id = ctx.userId;
    
    // 验证是否为base64格式的图片数据
    if (!imageData.startsWith('data:image/')) {
      ctx.status = 400;
      ctx.body = {
        code: 0,
        msg: '无效的图片数据格式'
      };
      return;
    }

    // 提取文件类型和base64数据
    const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      ctx.status = 400;
      ctx.body = {
        code: 0,
        msg: '无效的base64图片格式'
      };
      return;
    }

    const fileType = matches[1];
    const base64Data = matches[2];
    
    // 验证文件类型
    const allowedTypes = ['jpeg', 'jpg', 'png', 'gif', 'webp'];
    if (!allowedTypes.includes(fileType.toLowerCase())) {
      ctx.status = 400;
      ctx.body = {
        code: 0,
        msg: '不支持的文件类型，请上传图片文件'
      };
      return;
    }

    // 计算文件大小（base64解码后的大小）
    const fileSize = Math.round((base64Data.length * 3) / 4);
    
    // 验证文件大小（最大5MB）
    if (fileSize > 5 * 1024 * 1024) {
      ctx.status = 400;
      ctx.body = {
        code: 0,
        msg: '文件大小不能超过5MB'
      };
      return;
    }

    console.log('准备上传全身照，大小:', fileSize, '类型:', fileType);
    
    const result = await uploadPhoto(imageData, id);
    
    ctx.body = {
      code: 1,
      msg: '全身照上传成功',
      data: result
    };
  } catch (error) {
    console.error('上传全身照失败:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      msg: '上传全身照失败，请重试',
      error: error.message
    };
  }
})

// 获取用户信息
router.get('/getUserInfo', verify(), async (ctx) => {
    const user_id = ctx.userId
    try {
        const res = await getUserInfoById(user_id)
        if (res) {
            ctx.body = {
                code: 1,
                msg: '获取成功',
                data: res,
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


module.exports = router
