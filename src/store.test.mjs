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
