const axios = require('axios')
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')

// 环境变量中获取 PAT TOKEN
const patToken = process.env.COZE_PAT_TOKEN;
const uploadUrl = 'https://api.coze.cn/v1/files/upload';
const workflowUrl = 'https://api.coze.cn/v1/workflow/run';
const workflow_id = process.env.COZE_WORKFLOW_ID; // 从环境变量获取
const workflow2_id = process.env.COZE_WORKFLOW2_ID; // 从环境变量获取


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

// 生成搭配预览图
const generatePreview = async (ctx) => {
    const req = ctx.request;
    try {
        // 获取上传的文件
        const topFile = req.files?.top?.[0];
        const bottomFile = req.files?.bottom?.[0];
        const modelFile = req.files?.characterModel?.[0];

        // 获取表单字段
        const { sex } = req.body;

        console.log('生成预览图请求参数:');
        // console.log('上装文件:', topFile ? { name: topFile.originalname, size: topFile.size } : '无');
        // console.log('下装文件:', bottomFile ? { name: bottomFile.originalname, size: bottomFile.size } : '无');
        console.log('性别:', sex);
        // console.log('角色模型:', modelFile ? { name: modelFile.originalname, size: modelFile.size } : '无');
        console.log('-----------------------------------------------');

        // 参数验证
        if (!topFile || !bottomFile) {
            ctx.status = 400;
            ctx.body = { code: 0, msg: '请上传上装和下装图片' };
            return;
        }

        // 1. 上传图片到coze 获取file_id
        // 上传上装图片 获取file_id
        const topFormData = new FormData()
        topFormData.append('file', topFile.buffer, {
            filename: topFile.originalname,
            contentType: topFile.mimetype
        });
        const topUploadResponse = await axios.post(uploadUrl, topFormData, {
            headers: {
                'Authorization': `Bearer ${patToken}`,
                'Content-Type': 'multipart/form-data'
            }
        });
        if (topUploadResponse.data.code !== 0) {
            ctx.status = 500;
            ctx.body = { code: 0, msg: '上装图片上传失败' };
            return;
        }
        const topFile_id = topUploadResponse.data.data.id;
        
        // 上传下装图片 获取file_id
        const bottomFormData = new FormData()
        bottomFormData.append('file', bottomFile.buffer, {
            filename: bottomFile.originalname,
            contentType: bottomFile.mimetype
        });
        const bottomUploadResponse = await axios.post(uploadUrl, bottomFormData, {
            headers: {
                'Authorization': `Bearer ${patToken}`,
                'Content-Type': 'multipart/form-data'
            }
        });
        if (bottomUploadResponse.data.code !== 0) {
            ctx.status = 500;
            ctx.body = { code: 0, msg: '下装图片上传失败' };
            return;
        }
        const bottomFile_id = bottomUploadResponse.data.data.id;

        // 上传模特图片 获取file_id
        const modelFormData = new FormData()
        modelFormData.append('file', modelFile.buffer, {
            filename: modelFile.originalname,
            contentType: modelFile.mimetype
        });
        const modelUploadResponse = await axios.post(uploadUrl, modelFormData, {
            headers: {
                'Authorization': `Bearer ${patToken}`,
                'Content-Type': 'multipart/form-data'
            }
        });
        if (modelUploadResponse.data.code !== 0) {
            ctx.status = 500;
            ctx.body = { code: 0, msg: '模特图片上传失败' };
            return;
        }
        const modelFile_id = modelUploadResponse.data.data.id;  
        
        console.log('上装图片上传成功:', topFile_id);
        console.log('下装图片上传成功:', bottomFile_id);
        console.log('模特图片上传成功:', modelFile_id);
        console.log('-----------------------------------------------');


        // 2. 调用 coze 工作流
        const workflowResponse = await axios.post(workflowUrl, {
            workflow_id: workflow2_id,
            parameters: {
                topClothes: JSON.stringify({ file_id: topFile_id }),
                bottomClothes: JSON.stringify({ file_id: bottomFile_id }),
                characterModel: JSON.stringify({ file_id: modelFile_id }),
                sex
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
        console.error('生成预览图错误:', error);
        ctx.status = 500;
        ctx.body = { code: 0, msg: '服务器错误' };
    }
}

module.exports = {
    analyzeClothes,
    generatePreview,
}
