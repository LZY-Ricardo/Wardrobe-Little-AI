// 数据库相关操作
const mysql = require('mysql2')
const config = require('../config')
const bcrypt = require('bcrypt')

// 设置bcrypt的盐轮数
const saltRounds = 10

// 创建线程池
const pool = mysql.createPool({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    port: config.db.port
})

// 执行sql的方法
const allServices = {
    async query(sql, params) {
        return new Promise((resolve, reject) => {
            pool.query(sql, params, (err, results) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(results)
                }
            })
        })
    }
}

// 用户登录
const userLogin = async (username, password) => {
    try {
        // 只通过用户名查询用户
        const sql = 'SELECT * FROM user WHERE username = ?'
        const params = [username]
        const results = await allServices.query(sql, params)
        
        if (results.length > 0) {
            const user = results[0]
            // 使用bcrypt比较密码
            const match = await bcrypt.compare(password, user.password)
            
            if (match) {
                return user
            }
        }
        return null
    } catch (error) {
        console.error('登录错误:', error)
        return null
    }
}

// 用户注册
const userRegister = async (data) => {
    try {
        // 使用bcrypt加密密码
        const hashedPassword = await bcrypt.hash(data.password, saltRounds)
        
        const sql = 'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)'
        const params = [data.username, hashedPassword, data.create_time, data.create_time]
        console.log('注册用户数据:', {...data, password: '[已加密]'});
        
        const results = await allServices.query(sql, params)
        console.log('注册结果:', results);
        
        if (results.affectedRows > 0) {
            return true
        } else {
            return null
        }
    } catch (error) {
        console.error('注册错误:', error)
        return null
    }
}

// 检查用户名是否存在
const checkUsername = async (username) => {
    const sql = 'SELECT * FROM user WHERE username = ?'
    const params = [username]
    const results = await allServices.query(sql, params)
    if (results.length > 0) {
        return true
    } else {
        return false
    }
}

// 上传全身照 
const uploadPhoto = async (characterModel, id) => {
    const sql = 'UPDATE user SET characterModel = ? WHERE id = ?'
    const params = [characterModel, id]
    const results = await allServices.query(sql, params)
    if (results.affectedRows > 0) {
        return true
    } else {
        return false
    }
}

// 获取用户信息
const getUserInfoById = async (id) => {
    const sql = 'SELECT * FROM user WHERE id = ?'
    const params = [id]
    const results = await allServices.query(sql, params)
    if (results.length > 0) {
        return results[0]
    } else {
        return null
    }
}

// 修改用户昵称
const updateUserName = async (id, name) => {
    const sql = 'UPDATE user SET name = ? WHERE id = ?'
    const params = [name, id]
    const results = await allServices.query(sql, params)
    if (results.affectedRows > 0) {
        return true
    } else {
        return false
    }
}

// 修改用户性别
const updateSex = async (id, sex) => {
    const sql = 'UPDATE user SET sex = ? WHERE id = ?'
    const params = [sex, id]
    const results = await allServices.query(sql, params)
    if (results.affectedRows > 0) {
        return true
    } else {
        return false
    }
}

// 修改密码
const updatePassword = async (id, oldPassword, newPassword) => {
    const sql = 'SELECT * FROM user WHERE id = ?'
    const params = [id]
    const results = await allServices.query(sql, params)
    if (results.length > 0) {
        const user = results[0]
        // 使用bcrypt比较密码
        const match = await bcrypt.compare(oldPassword, user.password)
        if (match) {
            // 使用bcrypt加密新密码
            const hashedPassword = await bcrypt.hash(newPassword, saltRounds)
            const sql = 'UPDATE user SET password = ? WHERE id = ?'
            const params = [hashedPassword, id]
            const results = await allServices.query(sql, params)
            if (results.affectedRows > 0) {
                return true
            } else {
                return false
            }
        } else {
            return false
        }
    } else {
        return false
    }
}

module.exports = {
    userLogin,
    userRegister,
    checkUsername,
    uploadPhoto,
    getUserInfoById,
    updateSex,
    updateUserName,
    updatePassword,
}

