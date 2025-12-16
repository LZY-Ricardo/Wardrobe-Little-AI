// 加载环境变量（生产部署时常从仓库根目录启动，需显式指向 server/.env）
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

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
