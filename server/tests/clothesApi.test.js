const test = require('node:test')
const assert = require('node:assert/strict')

const clothesApi = require('../controllers/clothesApi')

const { __testables } = clothesApi

test('generatePreviewFromInputs keeps source mime type when uploading preview assets', async () => {
  const calls = []

  const previewUrl = await clothesApi.generatePreviewFromInputs({
    top: {
      dataUrl: 'data:image/png;base64,c2hpcnQ=',
      name: 'top-look',
    },
    bottom: {
      dataUrl: 'data:image/webp;base64,cGFudHM=',
      name: 'bottom-look',
    },
    characterModel: {
      dataUrl: 'data:image/jpeg;base64,bW9kZWw=',
      name: 'avatar-look',
    },
    sex: 'woman',
    deps: {
      breaker: {
        isOpen: () => false,
        exec: async (fn) => fn(),
      },
      axiosPost: async (url, payload, config = {}) => {
        calls.push({ url, payload, config })
        if (String(url).includes('/files/upload')) {
          return {
            data: {
              code: 0,
              data: { id: `file-${calls.length}` },
            },
          }
        }
        return {
          data: {
            code: 0,
            data: JSON.stringify({ output: 'data:image/png;base64,cHJldmlldw==' }),
          },
        }
      },
    },
  })

  assert.equal(previewUrl, 'data:image/png;base64,cHJldmlldw==')
  assert.equal(calls.length, 4)

  const uploadCalls = calls.slice(0, 3)
  const contentTypes = uploadCalls.map((call) => call.payload.getBuffer().toString('utf8'))
  assert.match(contentTypes[0], /Content-Type: image\/png/)
  assert.match(contentTypes[0], /filename="top-look"/)
  assert.match(contentTypes[1], /Content-Type: image\/webp/)
  assert.match(contentTypes[1], /filename="bottom-look"/)
  assert.match(contentTypes[2], /Content-Type: image\/jpeg/)
  assert.match(contentTypes[2], /filename="avatar-look"/)
})

test('buildUpstreamErrorDetails extracts actionable details from axios-style upstream errors', () => {
  const error = new Error('Request failed with status code 415')
  error.code = 'ERR_BAD_REQUEST'
  error.response = {
    status: 415,
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'coze-123',
    },
    data: {
      code: 40012,
      msg: 'unsupported image type',
      detail: 'image/png expected',
    },
  }

  const details = __testables.buildUpstreamErrorDetails(error)

  assert.equal(details.code, 'ERR_BAD_REQUEST')
  assert.equal(details.status, 415)
  assert.equal(details.responseCode, 40012)
  assert.equal(details.responseMessage, 'unsupported image type')
  assert.equal(details.responseDetail, 'image/png expected')
  assert.equal(details.responseHeaders['content-type'], 'application/json')
  assert.equal(details.responseHeaders['x-request-id'], 'coze-123')
})

test('generatePreviewFromInputs surfaces upstream workflow business message', async () => {
  await assert.rejects(
    clothesApi.generatePreviewFromInputs({
      top: {
        dataUrl: 'data:image/png;base64,c2hpcnQ=',
        name: 'top-look',
      },
      bottom: {
        dataUrl: 'data:image/png;base64,cGFudHM=',
        name: 'bottom-look',
      },
      characterModel: {
        dataUrl: 'data:image/jpeg;base64,bW9kZWw=',
        name: 'avatar-look',
      },
      sex: 'woman',
      deps: {
        breaker: {
          isOpen: () => false,
          exec: async (fn) => fn(),
        },
        axiosPost: async (url) => {
          if (String(url).includes('/files/upload')) {
            return {
              data: {
                code: 0,
                data: { id: 'file-ok' },
              },
            }
          }
          return {
            headers: {
              'content-type': 'application/json',
              'x-tt-logid': 'log-4028',
            },
            data: {
              code: 4028,
              msg: 'Insufficient coze credits balance',
              detail: { logid: 'log-4028' },
            },
          }
        },
      },
    }),
    (error) => {
      assert.equal(error.status, 502)
      assert.equal(error.message, 'Insufficient coze credits balance')
      return true
    },
  )
})

test('generatePreview rejects male profile skirt request before workflow execution', async () => {
  const ctx = {
    userId: 42,
    request: {
      body: {
        sex: 'man',
        bottomType: '下衣 / 长裤',
        bottomClothId: '18',
      },
      files: {
        top: [{ originalname: 'top.jpg', mimetype: 'image/jpeg', size: 3, buffer: Buffer.from('top') }],
        bottom: [{ originalname: 'bottom.jpg', mimetype: 'image/jpeg', size: 6, buffer: Buffer.from('bottom') }],
        characterModel: [{ originalname: 'model.jpg', mimetype: 'image/jpeg', size: 5, buffer: Buffer.from('model') }],
      },
    },
    state: {
      requestId: 'req-preview-compat',
    },
    status: 200,
    body: null,
  }

  await clothesApi.generatePreview(ctx, {
    getClothByIdForUser: async () => ({
      cloth_id: 18,
      type: '下衣 / 半身裙',
    }),
  })

  assert.equal(ctx.status, 400)
  assert.deepEqual(ctx.body, {
    code: 0,
    msg: '当前模特不支持所选女性裙装预览',
  })
})

test('generatePreview rejects preview requests without trusted bottom cloth id', async () => {
  const ctx = {
    userId: 42,
    request: {
      body: {
        sex: 'man',
        bottomType: '下衣 / 长裤',
      },
      files: {
        top: [{ originalname: 'top.jpg', mimetype: 'image/jpeg', size: 3, buffer: Buffer.from('top') }],
        bottom: [{ originalname: 'bottom.jpg', mimetype: 'image/jpeg', size: 6, buffer: Buffer.from('bottom') }],
        characterModel: [{ originalname: 'model.jpg', mimetype: 'image/jpeg', size: 5, buffer: Buffer.from('model') }],
      },
    },
    state: {
      requestId: 'req-preview-missing-bottom-id',
    },
    status: 200,
    body: null,
  }

  await clothesApi.generatePreview(ctx, {
    getClothByIdForUser: async () => {
      throw new Error('should not query clothes without a trusted bottom cloth id')
    },
  })

  assert.equal(ctx.status, 400)
  assert.deepEqual(ctx.body, {
    code: 0,
    msg: '请重新选择下衣后再生成预览',
  })
})

test('generatePreview continues with trusted compatible bottom cloth id', async () => {
  const ctx = {
    userId: 42,
    request: {
      body: {
        sex: 'woman',
        bottomClothId: '28',
      },
      files: {
        top: [{ originalname: 'top.jpg', mimetype: 'image/jpeg', size: 3, buffer: Buffer.from('top') }],
        bottom: [{ originalname: 'bottom.jpg', mimetype: 'image/jpeg', size: 6, buffer: Buffer.from('bottom') }],
        characterModel: [{ originalname: 'model.jpg', mimetype: 'image/jpeg', size: 5, buffer: Buffer.from('model') }],
      },
    },
    state: {
      requestId: 'req-preview-compatible',
    },
    status: 200,
    body: null,
  }

  const calls = []
  await clothesApi.generatePreview(ctx, {
    getClothByIdForUser: async () => ({
      cloth_id: 28,
      type: '下衣 / 长裤',
    }),
    breaker: {
      isOpen: () => false,
    },
    ensureCozeConfig: () => {},
    generatePreviewFromInputs: async (payload) => {
      calls.push(payload)
      return 'data:image/png;base64,preview'
    },
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].sex, 'woman')
  assert.equal(calls[0].requestId, 'req-preview-compatible')
  assert.equal(calls[0].top.originalname, 'top.jpg')
  assert.equal(calls[0].bottom.originalname, 'bottom.jpg')
  assert.equal(calls[0].characterModel.originalname, 'model.jpg')
  assert.equal(ctx.status, 200)
  assert.deepEqual(ctx.body, {
    code: 1,
    data: 'data:image/png;base64,preview',
  })
})
