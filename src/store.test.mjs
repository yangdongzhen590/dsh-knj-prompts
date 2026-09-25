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
  // 内置场景只保留「导出场景包」「安装场景包」两个
  assert.equal(scenes.length, 2)
  assert.deepEqual(scenes.map((s) => s.id).sort(), ['export-scene-package', 'install-scene-package'])
  assert.ok(scenes.every((s) => s.builtin === true))
  assert.ok(scenes.every((s) => /^[a-zA-Z0-9\u4e00-\u9fff][a-zA-Z0-9\u4e00-\u9fff-]*$/.test(s.id)))
  rmSync(dir, { recursive: true, force: true })
})

test('用户改过 prompt 的内置场景不被 seed 覆盖', () => {
  const dir = tempRoot()
  const file = join(dir, 'scenes.json')
  const store = new SceneStore(file)
  const scenes = store.list()
  const target = scenes.find((s) => s.id === 'export-scene-package')
  const edited = { ...target, prompt: '用户自定义文案' }
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
  assert.equal(store.list().length, 2)
  assert.ok(existsSync(file + '.bak'))
  rmSync(dir, { recursive: true, force: true })
})

test('旧场景缺 favorite 时加载为 false', () => {
  const dir = tempRoot()
  const file = join(dir, 'scenes.json')
  writeFileSync(file, JSON.stringify({
    version: 1,
    scenes: [{ id: 'legacy-scene', name: '旧场景', description: '', prompt: '旧提示词', builtin: false, updatedAt: 't0' }],
  }), 'utf8')
  const store = new SceneStore(file)
  const legacy = store.list().find((scene) => scene.id === 'legacy-scene')
  assert.equal(legacy.favorite, false)
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
    scenes: [{ id: 'export-scene-package', name: '导出场景包', description: '旧描述', prompt: '旧版 seed 文案', builtin: true, updatedAt: new Date(0).toISOString(), seedPrompt: '旧版 seed 文案' }],
  }), 'utf8')
  const store = new SceneStore(file)
  const after = store.list().find((s) => s.id === 'export-scene-package')
  // 当前 SEED_SCENES 的 prompt 已不同于旧文案 → 未编辑场景必须升级到新 seed
  assert.notEqual(after.prompt, '旧版 seed 文案', '未编辑的内置场景应随插件升级更新 prompt')
  assert.equal(after.seedPrompt, after.prompt, '升级后 seedPrompt 同步为新 seed')
  // 落盘也一致
  const onDisk = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(onDisk.scenes.find((s) => s.id === 'export-scene-package').prompt, after.prompt)
  rmSync(dir, { recursive: true, force: true })
})

test('seed 升级：用户编辑过（prompt !== seedPrompt）的内置场景保持用户版本', () => {
  const dir = tempRoot()
  const file = join(dir, 'scenes.json')
  writeFileSync(file, JSON.stringify({
    version: 1,
    scenes: [{ id: 'export-scene-package', name: '导出场景包', description: '', prompt: '我的定制文案', builtin: true, updatedAt: '2026-08-01T00:00:00.000Z', seedPrompt: '旧版 seed 文案' }],
  }), 'utf8')
  const store = new SceneStore(file)
  const after = store.list().find((s) => s.id === 'export-scene-package')
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
    scenes: [{ id: 'install-scene-package', name: '安装场景包', description: '', prompt: '旧版安装文案', builtin: true, updatedAt: new Date(0).toISOString() }],
  }), 'utf8')
  const store = new SceneStore(file)
  const after = store.list().find((s) => s.id === 'install-scene-package')
  assert.notEqual(after.prompt, '旧版安装文案', 'EPOCH = 从未经用户保存编辑 → 升级到新 seed')
  assert.equal(after.seedPrompt, after.prompt)
  rmSync(dir, { recursive: true, force: true })
})

test('旧格式迁移：无 seedPrompt 且 updatedAt 非 EPOCH（用户编辑过）→ 保守保持用户版本', () => {
  const dir = tempRoot()
  const file = join(dir, 'scenes.json')
  writeFileSync(file, JSON.stringify({
    version: 1,
    scenes: [{ id: 'install-scene-package', name: '安装场景包', description: '', prompt: '我改过的文案', builtin: true, updatedAt: '2026-08-01T00:00:00.000Z' }],
  }), 'utf8')
  const store = new SceneStore(file)
  const after = store.list().find((s) => s.id === 'install-scene-package')
  assert.equal(after.prompt, '我改过的文案', '旧格式无法确认 seed 基线时保守不动')
  rmSync(dir, { recursive: true, force: true })
})

// ===== 内置场景回收：不再属于 seed 的旧内置场景 =====

test('回收：未编辑过的旧内置场景（不在 seed 列表）被移除', () => {
  const dir = tempRoot()
  const file = join(dir, 'scenes.json')
  writeFileSync(file, JSON.stringify({
    version: 1,
    scenes: [
      { id: 'knowledge-retrieval', name: '知识检索', description: '', prompt: '旧版检索文案', builtin: true, updatedAt: new Date(0).toISOString(), seedPrompt: '旧版检索文案' },
    ],
  }), 'utf8')
  const store = new SceneStore(file)
  assert.equal(store.list().find((s) => s.id === 'knowledge-retrieval'), undefined, '未编辑的旧内置场景应被移除')
  assert.deepEqual(store.list().map((s) => s.id).sort(), ['export-scene-package', 'install-scene-package'], '只应剩两个内置场景')
  const onDisk = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(onDisk.scenes.length, 2, '移除结果应落盘')
  rmSync(dir, { recursive: true, force: true })
})

test('回收：用户编辑过的旧内置场景降级为普通场景（保留内容，不再占用内置身份）', () => {
  const dir = tempRoot()
  const file = join(dir, 'scenes.json')
  writeFileSync(file, JSON.stringify({
    version: 1,
    scenes: [
      { id: 'code-review', name: '我的审查', description: '定制', prompt: '我改过的审查文案', builtin: true, updatedAt: '2026-08-01T00:00:00.000Z', seedPrompt: '旧版审查文案' },
    ],
  }), 'utf8')
  const store = new SceneStore(file)
  const kept = store.list().find((s) => s.id === 'code-review')
  assert.ok(kept, '用户编辑过的场景不得被删除（避免丢内容）')
  assert.equal(kept.builtin, false, '应降级为普通场景')
  assert.equal(kept.prompt, '我改过的审查文案', '内容保持用户版本')
  assert.equal(kept.seedPrompt, undefined, '不再保留 seed 基线（已是普通场景）')
  rmSync(dir, { recursive: true, force: true })
})

test('回收：旧格式无基线时按 updatedAt 判定（EPOCH=未编辑→移除；非 EPOCH=编辑过→降级保留）', () => {
  const dir = tempRoot()
  const file = join(dir, 'scenes.json')
  writeFileSync(file, JSON.stringify({
    version: 1,
    scenes: [
      { id: 'architecture-design', name: '架构设计', description: '', prompt: '旧版架构文案', builtin: true, updatedAt: new Date(0).toISOString() },
      { id: 'requirement-breakdown', name: '需求拆解', description: '', prompt: '我改过的拆解文案', builtin: true, updatedAt: '2026-08-01T00:00:00.000Z' },
    ],
  }), 'utf8')
  const store = new SceneStore(file)
  const list = store.list()
  assert.equal(list.find((s) => s.id === 'architecture-design'), undefined, 'EPOCH 旧格式视为未编辑 → 移除')
  const kept = list.find((s) => s.id === 'requirement-breakdown')
  assert.ok(kept && kept.builtin === false, '非 EPOCH 旧格式视为编辑过 → 降级保留')
  rmSync(dir, { recursive: true, force: true })
})

test('回收：用户自建场景（builtin=false）完全不受影响', () => {
  const dir = tempRoot()
  const file = join(dir, 'scenes.json')
  writeFileSync(file, JSON.stringify({
    version: 1,
    scenes: [
      { id: 'my-own', name: '我的场景', description: '', prompt: '自建提示词', builtin: false, updatedAt: '2026-08-01T00:00:00.000Z' },
    ],
  }), 'utf8')
  const store = new SceneStore(file)
  const mine = store.list().find((s) => s.id === 'my-own')
  assert.ok(mine, '用户自建场景不得被回收逻辑影响')
  assert.equal(mine.prompt, '自建提示词')
  assert.equal(store.list().length, 3, '自建 1 + 内置 2')
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

test('VarStore 枚举变量往返：value 可空、选项顺序保留', () => {
  const dir = tempRoot()
  const file = join(dir, 'vars.json')
  const options = [{ label: '测试环境1', value: 'https://t1.api' }, { label: '测试环境2', value: 'https://t2.api' }]
  new VarStore(file).save([{ name: '环境信息', value: '', options, updatedAt: '' }])
  const vars = new VarStore(file).list()
  assert.equal(vars.length, 1)
  assert.equal(vars[0].value, '')
  assert.deepEqual(vars[0].options, options)
  rmSync(dir, { recursive: true, force: true })
})

test('VarStore 加载时归一选项：空 label 回退为 value，缺值选项被剔除', () => {
  const dir = tempRoot()
  const file = join(dir, 'vars.json')
  writeFileSync(file, JSON.stringify({ version: 1, vars: [
    { name: '环境信息', value: '默认', options: [{ label: '  ', value: ' t1 ' }, { label: '坏选项', value: '   ' }], updatedAt: 't0' },
  ] }), 'utf8')
  const vars = new VarStore(file).list()
  assert.equal(vars.length, 1)
  assert.deepEqual(vars[0].options, [{ label: 't1', value: 't1' }])
  rmSync(dir, { recursive: true, force: true })
})

test('VarStore 加载时非法枚举（value 空且无有效选项）→ 条目作废', () => {
  const dir = tempRoot()
  const file = join(dir, 'vars.json')
  writeFileSync(file, JSON.stringify({ version: 1, vars: [
    { name: '空枚举', value: '', options: [{ label: 'a', value: '' }], updatedAt: 't0' },
    { name: '有值', value: 'keep', options: [], updatedAt: 't1' },
  ] }), 'utf8')
  const vars = new VarStore(file).list()
  assert.deepEqual(vars.map((v) => v.name), ['有值'])
  rmSync(dir, { recursive: true, force: true })
})

test('VarStore 选项变化刷新 updatedAt，未变化不刷新', () => {
  const dir = tempRoot()
  const file = join(dir, 'vars.json')
  const store = new VarStore(file)
  store.save([{ name: '环境信息', value: '', options: [{ label: '测试环境1', value: 't1' }], updatedAt: 't0' }])
  const first = store.list()[0].updatedAt
  store.save([{ name: '环境信息', value: '', options: [{ label: '测试环境1', value: 't1' }], updatedAt: first }])
  assert.equal(store.list()[0].updatedAt, first, '选项未变不得刷新 updatedAt')
  store.save([{ name: '环境信息', value: '', options: [{ label: '测试环境1', value: 't2' }], updatedAt: first }])
  assert.notEqual(store.list()[0].updatedAt, first, '选项变化应刷新 updatedAt')
  rmSync(dir, { recursive: true, force: true })
})
