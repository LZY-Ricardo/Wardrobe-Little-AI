// 转译标签 防止sql 注入
function escape(str) {
    if (!str || typeof str !== 'string') return str;
    return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

// 反转译标签
function unescape(str) {
    return str.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
}

module.exports = {
    escape,
    unescape,
}