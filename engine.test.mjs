// engine.test.mjs
// 场景引擎纯函数红绿测试（Node 24 原生 TS strip 直接 import 源文件）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractVariables, fillPrompt, validateScene, sanitizeId } from './src/client/engine.ts'

test('extractVariables 提取去重', () => {
  assert.deepEqual(extractVariables('检索 {主题} 并覆盖 {主题} 与 {范围}'), ['主题', '范围'])
})

test('fillPrompt 替换并保留缺失变量', () => {
  assert.equal(fillPrompt('查 {主题} / {范围}', { 主题: '知识库' }), '查 知识库 / {范围}')
})

test('validateScene 校验', () => {
  const valid = { id: 'a-b', name: 'n', description: '', prompt: 'p', builtin: false, updatedAt: '' }
  assert.ok(validateScene(valid))
  assert.equal(validateScene({ ...valid, id: 'bad id' }), null)
  assert.equal(validateScene({ ...valid, name: '' }), null)
  assert.equal(validateScene({ ...valid, prompt: '  ' }), null)
  assert.equal(validateScene(null), null)
})

test('sanitizeId 净化', () => {
  assert.equal(sanitizeId('知识检索 场景!'), '知识检索-场景')
  const fallback = sanitizeId('---')
  assert.match(fallback, /^scene-[a-z0-9]+$/)
})
