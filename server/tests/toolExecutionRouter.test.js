const test = require('node:test')
const assert = require('node:assert/strict')

const { buildLlmToolDefinitions } = require('../agent/tools/runtime/toolDefinitionBuilder')
const { routeToolExecution } = require('../agent/tools/runtime/toolExecutionRouter')

test('toolDefinitionBuilder converts metadata into llm tool schema', () => {
  const defs = buildLlmToolDefinitions([
    {
      name: 'list_clothes',
      description: 'x',
      parameters: { type: 'object', properties: {} },
    },
  ])

  assert.equal(defs[0].type, 'function')
  assert.equal(defs[0].function.name, 'list_clothes')
  assert.deepEqual(defs[0].function.parameters, { type: 'object', properties: {} })
})

test('toolExecutionRouter resolves read and write execution paths from metadata', () => {
  const readResult = routeToolExecution({
    tool: { name: 'list_clothes', mode: 'read', dangerous: false, confirmationPolicy: 'never' },
  })
  const writeResult = routeToolExecution({
    tool: { name: 'create_cloth', mode: 'write', dangerous: true, confirmationPolicy: 'always' },
  })

  assert.equal(readResult.type, 'direct')
  assert.equal(writeResult.type, 'confirm')
})
