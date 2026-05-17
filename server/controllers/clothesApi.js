require('../config')

const axios = require('axios')
const FormData = require('form-data')
const { createCircuitBreaker } = require('../utils/circuitBreaker')
const { log } = require('../utils/logger')

// 环境变量中获取 PAT TOKEN
const patToken = process.env.COZE_PAT_TOKEN;
const uploadUrl = 'https://api.coze.cn/v1/files/upload';
const workflowUrl = 'https://api.coze.cn/v1/workflow/run';
const workflow_id = process.env.COZE_WORKFLOW_ID; // 从环境变量获取
const workflow2_id = process.env.COZE_WORKFLOW2_ID; // 从环境变量获取
const COZE_TIMEOUT_MS = Number(process.env.COZE_TIMEOUT_MS) || 90000

const cozeBreaker = createCircuitBreaker({
    name: 'coze',
    failureThreshold: Number(process.env.COZE_BREAKER_FAILURE_THRESHOLD) || 3,
    cooldownMs: Number(process.env.COZE_BREAKER_COOLDOWN_MS) || 60 * 1000,
})

const PREVIEW_HEADER_ALLOWLIST = [
    'content-type',
    'x-request-id',
    'x-tt-logid',
    'x-trace-id',
    'x-b3-traceid',
]

const ensureCozeConfig = (workflow) => {
    if (!patToken) {
        const error = new Error('COZE_PAT_TOKEN is not set')
        error.status = 503
        throw error
    }
    if (!workflow) {
        const error = new Error('COZE_WORKFLOW_ID is not set')
        error.status = 503
        throw error
    }
}

const parseImageDataUrl = (dataUrl = '', fallbackName = 'image') => {
    const matched = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
    if (!matched) {
        const error = new Error('图片数据格式无效')
        error.status = 400
        throw error
    }

    return {
        buffer: Buffer.from(matched[2], 'base64'),
        mimeType: matched[1],
        originalname: fallbackName,
    }
}

const normalizePreviewImageInput = (input, fallbackName = 'image.jpg') => {
    if (input?.buffer && Buffer.isBuffer(input.buffer)) {
        return {
            buffer: input.buffer,
            mimeType: input.mimetype || input.mimeType || 'image/jpeg',
            originalname: input.originalname || input.name || fallbackName,
        }
    }

    if (typeof input?.dataUrl === 'string') {
        return parseImageDataUrl(input.dataUrl, input.name || fallbackName)
    }

    if (typeof input === 'string') {
        return parseImageDataUrl(input, fallbackName)
    }

    const error = new Error('缺少有效的图片输入')
    error.status = 400
    throw error
}

const safeParseJson = (value) => {
    if (typeof value !== 'string') return value
    try {
        return JSON.parse(value)
    } catch {
        return value
    }
}

const pickHeaders = (headers = {}) => PREVIEW_HEADER_ALLOWLIST.reduce((result, key) => {
    if (headers?.[key]) result[key] = headers[key]
    return result
}, {})

const buildImageDebugMeta = (file) => ({
    name: file.originalname,
    mimeType: file.mimeType,
    bytes: Buffer.isBuffer(file.buffer) ? file.buffer.length : 0,
})

const buildUpstreamErrorDetails = (error) => {
    const responseData = safeParseJson(error?.response?.data)
    return {
        name: error?.name || '',
        message: error?.message || '',
        code: error?.code || '',
        status: error?.response?.status || error?.status || null,
        responseCode: responseData?.code ?? null,
        responseMessage: responseData?.msg || responseData?.message || '',
        responseDetail: responseData?.detail || responseData?.error || '',
        responseHeaders: pickHeaders(error?.response?.headers),
    }
}

const toErrorDetailString = (detail) => {
    if (!detail) return ''
    if (typeof detail === 'string') return detail
    try {
        return JSON.stringify(detail)
    } catch {
        return String(detail)
    }
}

const logPreviewEvent = (level, message, meta = {}) => {
    log(level, message, {
        scope: 'clothes.genPreview',
        ...meta,
    })
}

const uploadPreviewImage = async (file, label, headers, axiosPost) => {
    const formData = new FormData()
    formData.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimeType,
    })

    const res = await axiosPost(uploadUrl, formData, {
        timeout: COZE_TIMEOUT_MS,
        proxy: false,
        headers,
    })

    if (res.data.code !== 0) {
        const upstreamMessage = res?.data?.msg || res?.data?.message || `${label}上传失败`
        const err = new Error(upstreamMessage)
        err.status = 502
        err.response = {
            status: 200,
            headers: res.headers,
            data: res.data,
        }
        throw err
    }

    return res.data.data.id
}

const generatePreviewFromInputs = async ({
    top,
    bottom,
    characterModel,
    sex,
    requestId = '',
    deps = {},
} = {}) => {
    ensureCozeConfig(workflow2_id)
    const breaker = deps.breaker || cozeBreaker
    const axiosPost = deps.axiosPost || axios.post

    if (breaker.isOpen()) {
        const error = new Error('预览生成服务繁忙，请稍后重试')
        error.status = 503
        throw error
    }

    const topFile = normalizePreviewImageInput(top, 'top.jpg')
    const bottomFile = normalizePreviewImageInput(bottom, 'bottom.jpg')
    const modelFile = normalizePreviewImageInput(characterModel, 'character-model.jpg')
    const normalizedSex = String(sex || '').trim()
    const previewMeta = {
        requestId,
        sex: normalizedSex,
        assets: {
            top: buildImageDebugMeta(topFile),
            bottom: buildImageDebugMeta(bottomFile),
            characterModel: buildImageDebugMeta(modelFile),
        },
    }

    if (!normalizedSex) {
        const error = new Error('请先设置性别')
        error.status = 400
        throw error
    }

    logPreviewEvent('info', 'preview_generate_start', previewMeta)

    const { workflowResponse } = await breaker.exec(async () => {
        const uploadHeaders = {
            'Authorization': `Bearer ${patToken}`,
            'Content-Type': 'multipart/form-data',
        }

        const uploadOne = async (file, label, field) => {
            try {
                const fileId = await uploadPreviewImage(file, label, uploadHeaders, axiosPost)
                logPreviewEvent('info', 'preview_upload_success', {
                    requestId,
                    field,
                    label,
                    fileId,
                    file: buildImageDebugMeta(file),
                })
                return fileId
            } catch (error) {
                logPreviewEvent('error', 'preview_upload_failed', {
                    requestId,
                    field,
                    label,
                    file: buildImageDebugMeta(file),
                    upstream: buildUpstreamErrorDetails(error),
                    stack: error?.stack || '',
                })
                throw error
            }
        }

        const [topFile_id, bottomFile_id, modelFile_id] = await Promise.all([
            uploadOne(topFile, '上装图片', 'top'),
            uploadOne(bottomFile, '下装图片', 'bottom'),
            uploadOne(modelFile, '模特图片', 'characterModel'),
        ])

        const workflowPayload = {
            workflow_id: workflow2_id,
            parameters: {
                topClothes: JSON.stringify({ file_id: topFile_id }),
                bottomClothes: JSON.stringify({ file_id: bottomFile_id }),
                characterModel: JSON.stringify({ file_id: modelFile_id }),
                sex: normalizedSex,
            }
        }

        let workflowResponse
        try {
            workflowResponse = await axiosPost(workflowUrl, workflowPayload, {
                timeout: COZE_TIMEOUT_MS,
                proxy: false,
                headers: {
                    'Authorization': `Bearer ${patToken}`,
                    'Content-Type': 'application/json',
                }
            })
        } catch (error) {
            logPreviewEvent('error', 'preview_workflow_request_failed', {
                requestId,
                workflowId: workflow2_id,
                fileIds: {
                    top: topFile_id,
                    bottom: bottomFile_id,
                    characterModel: modelFile_id,
                },
                upstream: buildUpstreamErrorDetails(error),
                stack: error?.stack || '',
            })
            throw error
        }

        if (workflowResponse.data.code !== 0) {
            const upstreamMessage = workflowResponse?.data?.msg || workflowResponse?.data?.message || '分析失败'
            const err = new Error(upstreamMessage)
            err.status = 502
            err.response = {
                status: 200,
                headers: workflowResponse.headers,
                data: workflowResponse.data,
            }
            logPreviewEvent('error', 'preview_workflow_business_failed', {
                requestId,
                workflowId: workflow2_id,
                fileIds: {
                    top: topFile_id,
                    bottom: bottomFile_id,
                    characterModel: modelFile_id,
                },
                upstream: buildUpstreamErrorDetails({
                    response: {
                        status: 200,
                        headers: workflowResponse.headers,
                        data: workflowResponse.data,
                    },
                }),
                upstreamDetailText: toErrorDetailString(workflowResponse?.data?.detail),
            })
            throw err
        }

        logPreviewEvent('info', 'preview_workflow_success', {
            requestId,
            workflowId: workflow2_id,
            fileIds: {
                top: topFile_id,
                bottom: bottomFile_id,
                characterModel: modelFile_id,
            },
        })

        return { workflowResponse }
    })

    const output = JSON.parse(workflowResponse.data.data).output
    logPreviewEvent('info', 'preview_generate_success', {
        requestId,
        outputType: typeof output === 'string' && output.startsWith('data:image/')
            ? 'data-url'
            : typeof output,
    })
    return output
}


// 上传图片到Coze并分析
const analyzeClothes = async (ctx) => {
    const req = ctx.request;
    const res = ctx.response;
    try {
        ensureCozeConfig(workflow_id)
        if (cozeBreaker.isOpen()) {
            ctx.status = 503
            ctx.body = { code: 0, msg: '分析服务繁忙，请稍后重试' }
            return
        }
        const imageFile = req.file
        console.log('上传的文件:', imageFile);
        console.log('-----------------------------------------------');

        if (!imageFile) {
            ctx.status = 400;
            ctx.body = { code: 0, msg: '请上传衣物图片' };
            return;
        }
        const { uploadResponse, workflowResponse } = await cozeBreaker.exec(async () => {
            // 1. 上传图片到COZE
            const formData = new FormData()
            formData.append('file', imageFile.buffer, {
                filename: imageFile.originalname,
                contentType: imageFile.mimetype
            });
            const uploadResponse = await axios.post(uploadUrl, formData, {
                timeout: COZE_TIMEOUT_MS,
                proxy: false,
                headers: {
                    'Authorization': `Bearer ${patToken}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (uploadResponse.data.code !== 0) {
                const err = new Error('图片上传失败')
                err.status = 502
                throw err
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
                timeout: COZE_TIMEOUT_MS,
                proxy: false,
                headers: {
                    'Authorization': `Bearer ${patToken}`,
                    'Content-Type': 'application/json'
                }
            });
            if (workflowResponse.data.code !== 0) {
                const err = new Error('分析失败')
                err.status = 502
                throw err
            }
            console.log('工作流响应数据:', workflowResponse.data.data);
            console.log('-----------------------------------------------');
            return { uploadResponse, workflowResponse }
        })

        // 解析返回结果
        const analysisResult = JSON.parse(workflowResponse.data.data).output

        // 返回分析结果给前端
        ctx.body = { code: 1, data: analysisResult };

    } catch (error) {
        console.error('分析衣物错误:', error);
        ctx.status = error.status || 500;
        ctx.body = { code: 0, msg: error?.message || '服务器错误' };
    }
};

// 生成搭配预览图
const generatePreview = async (ctx) => {
    const req = ctx.request;
    const requestId = ctx.state?.requestId || ''
    try {
        ensureCozeConfig(workflow2_id)
        if (cozeBreaker.isOpen()) {
            ctx.status = 503
            ctx.body = { code: 0, msg: '预览生成服务繁忙，请稍后重试' }
            return
        }
        // 获取上传的文件
        const topFile = req.files?.top?.[0];
        const bottomFile = req.files?.bottom?.[0];
        const modelFile = req.files?.characterModel?.[0];

        // 获取表单字段
        const { sex } = req.body;

        logPreviewEvent('info', 'preview_http_request_received', {
            requestId,
            sex: String(sex || '').trim(),
            topPresent: Boolean(topFile),
            bottomPresent: Boolean(bottomFile),
            characterModelPresent: Boolean(modelFile),
            files: {
                top: topFile ? { name: topFile.originalname, mimeType: topFile.mimetype, bytes: topFile.size } : null,
                bottom: bottomFile ? { name: bottomFile.originalname, mimeType: bottomFile.mimetype, bytes: bottomFile.size } : null,
                characterModel: modelFile ? { name: modelFile.originalname, mimeType: modelFile.mimetype, bytes: modelFile.size } : null,
            },
        })

        // 参数验证
        if (!topFile || !bottomFile) {
            ctx.status = 400;
            ctx.body = { code: 0, msg: '请上传上装和下装图片' };
            return;
        }
        if (!modelFile) {
            ctx.status = 400
            ctx.body = { code: 0, msg: '请上传人物模特图片' }
            return
        }

        const analysisResult = await generatePreviewFromInputs({
            top: topFile,
            bottom: bottomFile,
            characterModel: modelFile,
            sex,
            requestId,
        })

        // 返回分析结果给前端
        ctx.body = { code: 1, data: analysisResult };

    } catch (error) {
        logPreviewEvent('error', 'preview_http_request_failed', {
            requestId,
            status: error.status || 500,
            error: error?.message || '服务器错误',
            upstream: buildUpstreamErrorDetails(error),
            stack: error?.stack || '',
        })
        ctx.status = error.status || 500;
        ctx.body = { code: 0, msg: error?.message || '服务器错误' };
    }
}

module.exports = {
    analyzeClothes,
    generatePreviewFromInputs,
    generatePreview,
    __testables: {
        buildUpstreamErrorDetails,
        normalizePreviewImageInput,
    },
}
