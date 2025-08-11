const axios = require('axios')
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')

// 环境变量中获取 PAT TOKEN
const patToken = process.env.COZE_PAT_TOKEN;
const uploadUrl = 'https://api.coze.cn/v1/files/upload';
const workflowUrl = 'https://api.coze.cn/v1/workflow/run';
const workflow_id = process.env.COZE_WORKFLOW_ID; // 从环境变量获取

// 上传图片到Coze并分析
const analyzeClothes = async (ctx) => {
    const req = ctx.request;
    const res = ctx.response;
    try {
        const imageFile = req.file
        console.log('上传的文件:', imageFile);
        console.log('-----------------------------------------------');
        
        if (!imageFile) {
            ctx.status = 400;
            ctx.body = { code: 0, msg: '请上传衣物图片' };
            return;
        }
        // 1. 上传图片到COZE
        const formData = new FormData()
        formData.append('file', imageFile.buffer, {
            filename: imageFile.originalname,
            contentType: imageFile.mimetype
        });
        const uploadResponse = await axios.post(uploadUrl, formData, {
            headers: {
                'Authorization': `Bearer ${patToken}`,
                'Content-Type': 'multipart/form-data'
            }
        });

        if (uploadResponse.data.code !== 0) {
            ctx.status = 500;
            ctx.body = { code: 0, msg: '图片上传失败' };
            return;
        }
        console.log('图片上传成功:', uploadResponse.data.data);
        console.log('-----------------------------------------------');
        
        const file_id = uploadResponse.data.data.id
        // 2. 调用Coze工作流
        const workflowResponse = await axios.post(workflowUrl, {
            workflow_id,
            parameters: {
                image: JSON.stringify({ file_id }),
            }
        }, {
            headers: {
                'Authorization': `Bearer ${patToken}`,
                'Content-Type': 'application/json'
            }
        });
        if (workflowResponse.data.code !== 0) {
            ctx.status = 500;
            ctx.body = { code: 0, msg: '分析失败' };
            return;
        }        
        console.log('工作流响应数据:', workflowResponse.data.data);
        console.log('-----------------------------------------------');

        // 解析返回结果
        const analysisResult = JSON.parse(workflowResponse.data.data).output

        // 返回分析结果给前端
        ctx.body = { code: 1, data: analysisResult };

    } catch (error) {
        console.error('分析衣物错误:', error);
        ctx.status = 500;
        ctx.body = { code: 0, msg: '服务器错误' };
    }
};


module.exports = {
    analyzeClothes
}
