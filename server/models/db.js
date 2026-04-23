const mysql = require('mysql2')
const config = require('../config')

const pool = mysql.createPool({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  port: config.db.port,
})

const promisePool = pool.promise()

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    pool.query(sql, params, (err, results) => {
      if (err) reject(err)
      else resolve(results)
    })
  })

const withTransaction = async (work) => {
  const connection = await promisePool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

module.exports = {
  pool,
  promisePool,
  query,
  withTransaction,
}
