// 加载环境变量
require('dotenv').config();

const config = {
    port: process.env.PORT || 3000,
    db: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '3239468786',
        database: process.env.DB_NAME || 'aiclothes_db',
        port: process.env.DB_PORT || 3306
    }
}

module.exports = config
