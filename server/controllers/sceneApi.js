const axios = require('axios')

// 从环境变量中获取
const patToken = process.env.COZE_PAT_TOKEN;
const uploadUrl = 'https://api.coze.cn/v1/files/upload';
const workflowUrl = 'https://api.coze.cn/v1/workflow/run';
const workflow3_id = process.env.COZE_WORKFLOW3_ID;

// 生成场景套装
const generateSceneSuits = async (ctx) => {
    try {
        // 获取前端传来的所有衣物数据
        const clothesData = ctx.request.body;
        
        // 这里处理衣物数据并生成场景套装
        // 示例：调用外部API处理数据
        const response = await axios.post(workflowUrl, {
            workflow_id: workflow3_id,
            input: {
                clothes_data: JSON.stringify(clothesData)
            }
        }, {
            headers: {
                'Authorization': `Bearer ${patToken}`,
                'Content-Type': 'application/json'
            }
        });

        // 返回处理结果
        ctx.body = { 
            code: 1, 
            data: response.data 
        };
    } catch (error) {
        console.error('生成场景套装错误:', error);
        ctx.body = { 
            code: 0, 
            msg: '生成场景套装失败' 
        };
    }
};

module.exports = {
    generateSceneSuits
}

