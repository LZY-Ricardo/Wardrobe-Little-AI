import test from 'node:test'
import assert from 'node:assert/strict'

import { createPreviewUploadFile } from '../src/pages/Match/previewUpload.js'

test('createPreviewUploadFile preserves blob mime type and derives extension', async () => {
  const blob = new Blob(['png-preview'], { type: 'image/png' })

  const file = createPreviewUploadFile(blob, 'bottom')

  assert.equal(file.type, 'image/png')
  assert.equal(file.name, 'bottom.png')
  assert.equal(await file.text(), 'png-preview')
})

test('createPreviewUploadFile falls back to jpeg when source blob has no mime type', () => {
  const blob = new Blob(['preview'])

  const file = createPreviewUploadFile(blob, 'top')

  assert.equal(file.type, 'image/jpeg')
  assert.equal(file.name, 'top.jpg')
})
