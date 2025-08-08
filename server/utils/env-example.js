/**
 * 环境变量使用示例
 */

// 方法1: 直接使用process.env（需要先加载dotenv）
require('dotenv').config();

console.log(`服务器端口: ${process.env.PORT}`);
console.log(`数据库主机: ${process.env.DB_HOST}`);

// 方法2: 通过配置文件使用（推荐）
const config = require('../config');

console.log(`服务器端口: ${config.port}`);
console.log(`数据库主机: ${config.db.host}`);
console.log(`数据库用户: ${config.db.user}`);