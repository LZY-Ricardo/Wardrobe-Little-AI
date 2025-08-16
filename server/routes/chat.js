const Router = require('@koa/router')
const router = new Router()
const axios = require('axios')

router.prefix('/chat')

/**
 * AI聊天接口 - 处理流式响应
 * 接收用户消息，转发给Ollama API，并将流式响应实时转发给前端
 */
router.get('/', async (ctx) => {
    console.log('Chat route accessed with message:', ctx.query.message);
    
    // 获取用户消息参数
    const { message } = ctx.query;
    
    // 验证必需参数
    if (!message) {
        ctx.status = 400;
        ctx.body = { error: 'Message parameter is required' };
        return;
    }
    
    // 设置为不使用Koa的响应处理，直接操作原生Node.js响应对象
    // 这样可以更精确地控制流式响应的发送
    ctx.respond = false;
    
    // 设置SSE（Server-Sent Events）响应头
    ctx.res.writeHead(200, {
        'Content-Type': 'text/event-stream',    // SSE内容类型
        'Cache-Control': 'no-cache',            // 禁用缓存
        'Connection': 'keep-alive',             // 保持连接
        'Access-Control-Allow-Origin': '*',     // 允许跨域
        'Access-Control-Allow-Headers': 'Authorization, Content-Type' // 允许的请求头
    });
    
    // 构造发送给Ollama的消息对象
    const messageObj = {
        role: 'user',
        content: message
    }
    
    // 构造Ollama API请求数据
    const data = {
        model: 'deepseek-r1:7b',  // 使用的AI模型
        messages: [messageObj],    // 消息数组
        stream: true,             // 启用流式响应
    }
    
    // 流式响应状态控制变量
    let isEnded = false;
    
    try {
        // 向Ollama API发送流式请求
        const response = await axios.post('http://localhost:11434/api/chat', data, {
            responseType: 'stream'  // 设置响应类型为流
        });
        
        /**
         * 处理从Ollama接收到的流式数据
         * 每当有新数据到达时触发此事件
         */
        response.data.on('data', (chunk) => {
            // 如果流已结束，忽略后续数据
            if (isEnded) return;
            
            // 将二进制数据转换为字符串，并按行分割
            const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
            
            // 处理每一行JSON数据
            lines.forEach(line => {
                if (isEnded) return;
                
                try {
                    // 解析JSON数据
                    const jsonData = JSON.parse(line);
                    console.log('Received from Ollama:', JSON.stringify(jsonData));
                    
                    // 如果有消息内容且流未结束，转发给前端
                    if (jsonData.message && jsonData.message.content && !isEnded) {
                        // 以SSE格式发送数据给前端
                        ctx.res.write(`data: ${jsonData.message.content}\n\n`);
                    }
                    
                    // 检查Ollama是否完成响应
                    if (jsonData.done && !isEnded) {
                        console.log('Ollama stream done, sending [DONE]');
                        isEnded = true;
                        // 发送结束标记给前端
                        ctx.res.write('data: [DONE]\n\n');
                        ctx.res.end(); // 结束响应
                    }
                } catch (parseError) {
                    // 记录JSON解析错误（某些行可能不是有效JSON）
                    console.log('Parse error for line:', line);
                }
            });
        });
        
        /**
         * 处理Ollama流结束事件
         * 当Ollama完全结束数据传输时触发
         */
        response.data.on('end', () => {
            console.log('Ollama stream ended, isEnded:', isEnded, 'headersSent:', ctx.res.headersSent);
            // 如果流未正常结束且响应头未发送，发送结束标记
            if (!isEnded && !ctx.res.headersSent) {
                console.log('Sending [DONE] from end event');
                isEnded = true;
                ctx.res.write('data: [DONE]\n\n');
                ctx.res.end();
            }
        });
        
        /**
         * 处理客户端断开连接事件
         * 当前端用户关闭页面或网络断开时触发
         */
        ctx.req.on('close', () => {
            isEnded = true;
            // 清理Ollama响应流，防止内存泄漏
            if (response.data && !response.data.destroyed) {
                response.data.destroy();
            }
        });
        
    } catch (error) {
        // 处理请求Ollama API时的错误
        console.error('Chat API Error:', error.message);
        if (!isEnded && !ctx.res.headersSent) {
            // 向前端发送错误信息
            ctx.res.write('event: error\ndata: ' + JSON.stringify({
                error: error.message
            }) + '\n\n');
            ctx.res.end();
        }
    }
})

module.exports = router
