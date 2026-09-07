import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
// SceneStore 使用 TypeScript 参数属性；以插件构建产物执行本集成持久化测试。
import { SceneStore } from './lib/store.js'

test('SceneStore normalizes a legacy missing operationManual to an empty string', () => {
  const root = mkdtempSync(join(tmpdir(), 'knj-prompts-store-'))
  try {
    const file = join(root, 'scenes.json')
    writeFileSync(file, JSON.stringify({
      version: 1,
      scenes: [{ id: 'legacy', name: 'Legacy', description: '', prompt: 'hello', builtin: false, updatedAt: 'now' }],
    }), 'utf8')
    const store = new SceneStore(file)
    const scene = store.list().find((item) => item.id === 'legacy')
    assert.equal(scene?.operationManual, '')
    store.save(store.list())
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(saved.scenes.find((item) => item.id === 'legacy').operationManual, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
