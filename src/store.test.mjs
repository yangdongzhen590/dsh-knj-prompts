// store.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { SceneStore } = require('../lib/store.js')

function tempRoot() { return mkdtempSync(join(tmpdir(), 'knj-prompts-')) }

test('首次运行 seed 合入且 id 净化', () => {
  const dir = tempRoot()
  const store = new SceneStore(join(dir, 'scenes.json'))
  const scenes = store.list()
  assert.equal(scenes.length, 4)
  assert.ok(scenes.every((s) => s.builtin === true))
  assert.ok(scenes.every((s) => /^[a-zA-Z0-9\u4e00-\u9fff][a-zA-Z0-9\u4e00-\u9fff-]*$/.test(s.id)))
  rmSync(dir, { recursive: true, force: true })
})

test('用户改过 prompt 的内置场景不被 seed 覆盖', () => {
  const dir = tempRoot()
  const file = join(dir, 'scenes.json')
  const store = new SceneStore(file)
  const scenes = store.list()
  const edited = { ...scenes[0], prompt: '用户自定义文案' }
  store.save(scenes.map((s) => (s.id === edited.id ? edited : s)))
  const store2 = new SceneStore(file)
  store2.ensureSeeded()
  const after = store2.list().find((s) => s.id === edited.id)
  assert.equal(after.prompt, '用户自定义文案')
  rmSync(dir, { recursive: true, force: true })
})

test('损坏 JSON 备份后重建为 seed', () => {
  const dir = tempRoot()
  const file = join(dir, 'scenes.json')
  writeFileSync(file, '{broken json', 'utf8')
  const store = new SceneStore(file)
  store.ensureSeeded()
  assert.equal(store.list().length, 4)
  assert.ok(existsSync(file + '.bak'))
  rmSync(dir, { recursive: true, force: true })
})

test('保存后文件无 BOM', () => {
  const dir = tempRoot()
  const file = join(dir, 'scenes.json')
  const store = new SceneStore(file)
  store.save(store.list())
  const head = readFileSync(file).subarray(0, 3)
  // 首个字节必须是 '{'（JSON 起始），且绝不是 EF BB BF（BOM）
  assert.equal(head[0], 0x7b)
  assert.notDeepEqual([...head], [0xef, 0xbb, 0xbf])
  rmSync(dir, { recursive: true, force: true })
})

test('seed 升级：用户未编辑过（prompt === seedPrompt）的内置场景随插件升级更新', () => {
  const dir = tempRoot()
  const file = join(dir, 'scenes.json')
  // 模拟旧版本插件写入的文件：内置场景 prompt 为旧 seed 文案，seedPrompt 与之一致（未编辑）
  writeFileSync(file, JSON.stringify({
    version: 1,
    scenes: [{ id: 'knowledge-retrieval', name: '知识检索', description: '旧描述', prompt: '旧版 seed 文案', builtin: true, updatedAt: new Date(0).toISOString(), seedPrompt: '旧版 seed 文案' }],
  }), 'utf8')
  const store = new SceneStore(file)
  const after = store.list().find((s) => s.id === 'knowledge-retrieval')
  // 当前 SEED_SCENES 的 prompt 已不同于旧文案 → 未编辑场景必须升级到新 seed
  assert.notEqual(after.prompt, '旧版 seed 文案', '未编辑的内置场景应随插件升级更新 prompt')
  assert.equal(after.seedPrompt, after.prompt, '升级后 seedPrompt 同步为新 seed')
  // 落盘也一致
  const onDisk = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(onDisk.scenes.find((s) => s.id === 'knowledge-retrieval').prompt, after.prompt)
  rmSync(dir, { recursive: true, force: true })
})

test('seed 升级：用户编辑过（prompt !== seedPrompt）的内置场景保持用户版本', () => {
  const dir = tempRoot()
  const file = join(dir, 'scenes.json')
  writeFileSync(file, JSON.stringify({
    version: 1,
    scenes: [{ id: 'knowledge-retrieval', name: '知识检索', description: '', prompt: '我的定制文案', builtin: true, updatedAt: '2026-08-01T00:00:00.000Z', seedPrompt: '旧版 seed 文案' }],
  }), 'utf8')
  const store = new SceneStore(file)
  const after = store.list().find((s) => s.id === 'knowledge-retrieval')
  assert.equal(after.prompt, '我的定制文案', '用户编辑过的场景不得被 seed 覆盖')
  assert.equal(after.seedPrompt, '旧版 seed 文案')
  rmSync(dir, { recursive: true, force: true })
})

test('旧格式迁移：无 seedPrompt 字段且 prompt 等于当前 seed → 视为未编辑并补记 seedPrompt', () => {
  const dir = tempRoot()
  const file = join(dir, 'scenes.json')
  // 旧格式（无 seedPrompt）：EPOCH + prompt 恰好等于旧 seed 文案的场景占位
  writeFileSync(file, JSON.stringify({
    version: 1,
    scenes: [{ id: 'code-review', name: '代码审查', description: '', prompt: '旧版审查文案', builtin: true, updatedAt: new Date(0).toISOString() }],
  }), 'utf8')
  const store = new SceneStore(file)
  const after = store.list().find((s) => s.id === 'code-review')
  assert.notEqual(after.prompt, '旧版审查文案', 'EPOCH = 从未经用户保存编辑 → 升级到新 seed')
  assert.equal(after.seedPrompt, after.prompt)
  rmSync(dir, { recursive: true, force: true })
})

test('旧格式迁移：无 seedPrompt 且 updatedAt 非 EPOCH（用户编辑过）→ 保守保持用户版本', () => {
  const dir = tempRoot()
  const file = join(dir, 'scenes.json')
  writeFileSync(file, JSON.stringify({
    version: 1,
    scenes: [{ id: 'code-review', name: '代码审查', description: '', prompt: '我改过的文案', builtin: true, updatedAt: '2026-08-01T00:00:00.000Z' }],
  }), 'utf8')
  const store = new SceneStore(file)
  const after = store.list().find((s) => s.id === 'code-review')
  assert.equal(after.prompt, '我改过的文案', '旧格式无法确认 seed 基线时保守不动')
  rmSync(dir, { recursive: true, force: true })
})

test('原子写：保存后目录里不残留 .tmp 文件', () => {
  const dir = tempRoot()
  const file = join(dir, 'scenes.json')
  const store = new SceneStore(file)
  store.save(store.list())
  const fs = require('node:fs')
  const litter = fs.readdirSync(dir).filter((f) => f.includes('.tmp'))
  assert.deepEqual(litter, [], 'tmp 文件用完必须清理')
  rmSync(dir, { recursive: true, force: true })
})

// ===== VarStore（变量库）=====
const { VarStore } = require('../lib/varstore.js')

test('VarStore 保存/重载往返（单值语义）', () => {
  const dir = tempRoot()
  const file = join(dir, 'vars.json')
  const store = new VarStore(file)
  store.save([{ name: '项目', value: 'iobs_pro', updatedAt: '' }])
  const store2 = new VarStore(file)
  const vars = store2.list()
  assert.equal(vars.length, 1)
  assert.equal(vars[0].name, '项目')
  assert.equal(vars[0].value, 'iobs_pro')
  // list 返回副本：改返回值不污染库内状态
  vars[0].value = 'X'
  assert.equal(store2.list()[0].value, 'iobs_pro')
  rmSync(dir, { recursive: true, force: true })
})

test('VarStore 旧格式 values[] 自动迁移为 value（取首值）并落盘', () => {
  const dir = tempRoot()
  const file = join(dir, 'vars.json')
  writeFileSync(file, JSON.stringify({ version: 1, vars: [
    { name: '需求', values: ['1', '2'], updatedAt: 't0' },
    { name: '测试', values: ['测试'], updatedAt: 't1' },
  ] }), 'utf8')
  const store = new VarStore(file)
  const vars = store.list()
  assert.equal(vars.length, 2)
  assert.equal(vars.find((v) => v.name === '需求').value, '1') // 首值
  assert.equal(vars.find((v) => v.name === '测试').value, '测试')
  // 已落盘为新 schema（无 values 字段）
  const onDisk = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(onDisk.vars.every((v) => typeof v.value === 'string' && !('values' in v)), true)
  rmSync(dir, { recursive: true, force: true })
})

test('VarStore 损坏 JSON 备份后重建为空库', () => {
  const dir = tempRoot()
  const file = join(dir, 'vars.json')
  writeFileSync(file, '{broken json', 'utf8')
  const store = new VarStore(file)
  assert.equal(store.list().length, 0)
  assert.ok(existsSync(file + '.bak'))
  rmSync(dir, { recursive: true, force: true })
})

test('VarStore 内容感知 updatedAt：未变化不刷新时间戳', () => {
  const dir = tempRoot()
  const file = join(dir, 'vars.json')
  const store = new VarStore(file)
  store.save([{ name: '项目', value: 'A', updatedAt: 't0' }])
  const first = store.list()[0].updatedAt
  store.save([{ name: '项目', value: 'A', updatedAt: first }]) // 内容相同
  assert.equal(store.list()[0].updatedAt, first, '内容未变不得刷新 updatedAt')
  store.save([{ name: '项目', value: 'B', updatedAt: first }]) // 内容变化
  assert.notEqual(store.list()[0].updatedAt, first, '内容变化应刷新 updatedAt')
  rmSync(dir, { recursive: true, force: true })
})
