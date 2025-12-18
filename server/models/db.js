const mysql = require('mysql2')
const config = require('../config')

const pool = mysql.createPool({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  port: config.db.port,
})

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    pool.query(sql, params, (err, results) => {
      if (err) reject(err)
      else resolve(results)
    })
  })

module.exports = {
  pool,
  query,
}

