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

// 插入衣物数据
const insertClothesData = async (data) => {
    const { user_id, name, type, color, style, season, material, image, create_time, update_time } = data
    const sql = 'INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    const params = [user_id, name, type, color, style, season, material, image, create_time, update_time]
    const result = await allServices.query(sql, params)
    if (result.affectedRows > 0) {
        return true
    } else {
        return false
    }
}

// 获取所有衣物数据
const getAllClothes = async (user_id) => {
    const sql = 'SELECT * FROM clothes WHERE user_id = ?'
    const params = [user_id]
    const result = await allServices.query(sql, params)
    if (result.length > 0) {
        return result
    } else {
        return false
    }
}

// 删除衣物
const deleteClothes = async (clothes_id) => {
    console.log('------------删除衣物------------');
    
    const sql = 'DELETE FROM clothes WHERE cloth_id = ?'
    const params = [clothes_id]
    const result = await allServices.query(sql, params)
    console.log('res',result);
    if (result.affectedRows > 0) {
        return true
    } else {
        return false
    }
}

// 更新衣物
const updateClothes = async (data) => {
    const { cloth_id, name, type, color, style, season, material, favorite, image, update_time } = data
    const sql = 'UPDATE clothes SET name = ?, type = ?, color = ?, style = ?, season = ?, material = ?, favorite = ?, image = ?, update_time = ? WHERE cloth_id = ?'
    const params = [name, type, color, style, season, material, favorite, image, update_time, cloth_id]
    const result = await allServices.query(sql, params)
    if (result.affectedRows > 0) {
        return true
    } else {
        return false
    }
}

// 获取上衣数据
const getTopClothes   = async (user_id) => {
    const sql = 'SELECT * FROM clothes WHERE user_id = ? AND type LIKE ?'
    const params = [user_id, '%上衣%']
    const result = await allServices.query(sql, params)
    if (result.length > 0) {
        return result
    } else {
        return false
    }
}

// 获取下衣数据
const getBotClothes   = async (user_id) => {
    const sql = 'SELECT * FROM clothes WHERE user_id = ? AND type LIKE ?'
    const params = [user_id, '%下衣%']
    const result = await allServices.query(sql, params)
    if (result.length > 0) {
        return result
    } else {
        return false
    }
}

module.exports = {
    insertClothesData,
    getAllClothes,
    deleteClothes,
    updateClothes,
    getTopClothes,
    getBotClothes,

}