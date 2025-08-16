const Router = require('@koa/router')
const router = new Router()
const axios = require('axios')

router.prefix('/chat')

router.get('/', async (ctx) => {
    console.log('Chat route accessed with message:', ctx.query.message);
    
    const { message } = ctx.query;
    
    if (!message) {
        ctx.status = 400;
        ctx.body = { error: 'Message parameter is required' };
        return;
    }
    
    // 设置为不使用Koa的响应处理，直接操作原生响应对象
    ctx.respond = false;
    
    ctx.res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type'
    });
    
    const messageObj = {
        role: 'user',
        content: message
    }
    
    const data = {
        model: 'deepseek-r1:7b',
        messages: [messageObj],
        stream: true,
    }
    
    let isEnded = false;
    
    try {
        const response = await axios.post('http://localhost:11434/api/chat', data, {
            responseType: 'stream'
        });
        
        response.data.on('data', (chunk) => {
            if (isEnded) return;
            
            const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
            lines.forEach(line => {
                if (isEnded) return;
                
                try {
                    const jsonData = JSON.parse(line);
                    if (jsonData.message && jsonData.message.content && !isEnded) {
                        ctx.res.write(`data: ${jsonData.message.content}\n\n`);
                    }
                    if (jsonData.done && !isEnded && !ctx.res.headersSent) {
                        isEnded = true;
                        ctx.res.write('data: [DONE]\n\n');
                        ctx.res.end();
                    }
                } catch (parseError) {
                    // 忽略解析错误的行
                }
            });
        });
        
        response.data.on('end', () => {
            if (!isEnded && !ctx.res.headersSent) {
                isEnded = true;
                ctx.res.write('data: [DONE]\n\n');
                ctx.res.end();
            }
        });
        
        ctx.req.on('close', () => {
            isEnded = true;
            if (response.data && !response.data.destroyed) {
                response.data.destroy();
            }
        });
    } catch (error) {
        console.error('Chat API Error:', error.message);
        if (!isEnded && !ctx.res.headersSent) {
            ctx.res.write('event: error\ndata: ' + JSON.stringify({
                error: error.message
            }) + '\n\n');
            ctx.res.end();
        }
    }
})

module.exports = router
