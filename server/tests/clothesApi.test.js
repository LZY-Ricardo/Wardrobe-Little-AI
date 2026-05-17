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
