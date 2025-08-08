// 数据库相关操作
const mysql = require('mysql2')
const config = require('../config')

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
    const sql = 'SELECT * FROM user WHERE username = ? AND password = ?'
    const params = [username, password]
    const results = await allServices.query(sql, params)
    if (results.length > 0) {
        return results[0]
    } else {
        return null
    }
}

// 用户注册
const userRegister = async (data) => {
    const sql = 'INSERT INTO user (username, password, create_time) VALUES (?, ?, ?)'
    const params = [data.username, data.password, data.create_time]
    console.log(data);
    const results = await allServices.query(sql, params)
    console.log(results);
    if (results.affectedRows > 0) {
        return true
    } else {
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


module.exports = {
    userLogin,
    userRegister,
    checkUsername

}

