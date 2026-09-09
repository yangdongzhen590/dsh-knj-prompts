// engine.test.mjs
// 场景引擎纯函数红绿测试（Node 24 原生 TS strip 直接 import 源文件）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEED_SCENES } from './src/types.ts'
import {
  extractVariables,
  fillPrompt,
  validateScene,
  sanitizeId,
  validateVar,
  hasDuplicateVarNames,
  findVar,
  hasDirtyVars,
  matchesFuzzy,
  filterScenes,
  filterVars,
  buildSceneEdit,
  buildVarEdit,
} from './src/client/engine.ts'

test('extractVariables 提取去重', () => {
  assert.deepEqual(extractVariables('检索 {主题} 并覆盖 {主题} 与 {范围}'), ['主题', '范围'])
})

test('fillPrompt 替换并保留缺失变量', () => {
  assert.equal(fillPrompt('查 {主题} / {范围}', { 主题: '知识库' }), '查 知识库 / {范围}')
})

test('validateScene 校验与场景包说明兼容', () => {
  const valid = { id: 'a-b', name: 'n', description: '', prompt: 'p', builtin: false, updatedAt: '', favorite: false }
  assert.deepEqual(validateScene(valid), { ...valid, operationManual: '' })
  assert.deepEqual(validateScene({ ...valid, operationManual: '# 安装说明' }), { ...valid, operationManual: '# 安装说明' })
  // favorite 缺失归一为 false，显式 true 透传
  assert.deepEqual(validateScene({ ...valid, favorite: undefined }), { ...valid, operationManual: '' })
  assert.equal(validateScene({ ...valid, favorite: true }).favorite, true)
  assert.equal(validateScene({ ...valid, operationManual: 1 }), null)
  assert.equal(validateScene({ ...valid, id: 'bad id' }), null)
  assert.equal(validateScene({ ...valid, name: '' }), null)
  assert.equal(validateScene({ ...valid, prompt: '  ' }), null)
  assert.equal(validateScene(null), null)
})

test('场景包内置场景引导 AI 使用 bootstrap skills', () => {
  const exporter = SEED_SCENES.find((scene) => scene.id === 'export-scene-package')
  const installer = SEED_SCENES.find((scene) => scene.id === 'install-scene-package')
  assert.ok(exporter)
  assert.ok(installer)
  assert.match(exporter.prompt, /scene-package-exporter/)
  assert.match(installer.prompt, /scene-package-installer/)
  assert.match(installer.prompt, /{场景包ZIP路径}/)
})

test('sanitizeId 净化', () => {
  assert.equal(sanitizeId('知识检索 场景!'), '知识检索-场景')
  const fallback = sanitizeId('---')
  assert.match(fallback, /^scene-[a-z0-9]+$/)
})

test('validateVar 校验变量条目（名称 + 单个值）', () => {
  const valid = { name: ' 项目 ', value: ' iobs_pro ', updatedAt: '' }
  const v = validateVar(valid)
  assert.ok(v)
  assert.equal(v.name, '项目')
  assert.equal(v.value, 'iobs_pro') // trim
  assert.equal(validateVar({ ...valid, name: '   ' }), null) // 空名
  assert.equal(validateVar({ name: 'x', value: '   ' }), null) // 空值
  assert.equal(validateVar(null), null)
  assert.equal(validateVar('str'), null)
})

test('hasDuplicateVarNames 大小写不敏感查重', () => {
  assert.equal(hasDuplicateVarNames([
    { name: 'Project', value: 'A', updatedAt: '' },
    { name: 'project', value: 'B', updatedAt: '' },
  ]), true)
  assert.equal(hasDuplicateVarNames([
    { name: 'Project', value: 'A', updatedAt: '' },
    { name: '范围', value: 'B', updatedAt: '' },
  ]), false)
  assert.equal(hasDuplicateVarNames([]), false)
})

test('findVar 大小写不敏感查找', () => {
  const vars = [
    { name: 'Project', value: 'A', updatedAt: '' },
    { name: '主题', value: '知识库', updatedAt: '' },
  ]
  assert.equal(findVar(vars, 'project').name, 'Project')
  assert.equal(findVar(vars, ' PROJECT ').name, 'Project')
  assert.equal(findVar(vars, '主题').value, '知识库')
  assert.equal(findVar(vars, '不存在'), null)
  assert.equal(findVar(null, 'x'), null)
})

test('hasDirtyVars 变量库脏检查', () => {
  const base = [
    { name: '项目', value: 'A', updatedAt: 't1' },
    { name: '范围', value: '代码', updatedAt: 't2' },
  ]
  // 仅 updatedAt 不同 → 不脏
  assert.equal(hasDirtyVars(base, base.map((v) => ({ ...v, updatedAt: 'new' }))), false)
  // 完全一致 → 不脏
  assert.equal(hasDirtyVars(base, base.map((v) => ({ ...v }))), false)
  // 改名（大小写变化也视为改）→ 脏
  assert.equal(hasDirtyVars(base, [{ ...base[0], name: '项目2' }, { ...base[1] }]), true)
  // 改值 → 脏
  assert.equal(hasDirtyVars(base, [{ ...base[0], value: 'B' }, { ...base[1] }]), true)
  // 增删 → 脏
  assert.equal(hasDirtyVars(base, [...base, { name: 'C', value: 'x', updatedAt: '' }]), true)
  assert.equal(hasDirtyVars(base, [base[0]]), true)
  assert.equal(hasDirtyVars([], []), false)
})

test('matchesFuzzy 大小写不敏感子串匹配', () => {
  assert.equal(matchesFuzzy('知识检索', '知识'), true)
  assert.equal(matchesFuzzy('知识检索', '检索'), true)
  assert.equal(matchesFuzzy('Code Review', 'code'), true)
  assert.equal(matchesFuzzy('Code Review', 'VIEW'), true)
  assert.equal(matchesFuzzy('知识检索', '测试'), false)
  // 空查询 = 全量命中
  assert.equal(matchesFuzzy('任意', '   '), true)
  assert.equal(matchesFuzzy('任意', ''), true)
})

test('filterScenes 按名称/描述/提示词过滤', () => {
  const scenes = [
    { id: 'a', name: '知识检索', description: '分层检索知识库', prompt: '用 wiki_query 查 {主题}', builtin: true, updatedAt: '' },
    { id: 'b', name: '代码审查', description: '四维输出', prompt: '审查代码 {范围}', builtin: true, updatedAt: '' },
    { id: 'c', name: '架构设计', description: '需求到方案', prompt: '为 {需求} 设计', builtin: true, updatedAt: '' },
  ]
  assert.equal(filterScenes(scenes, '知识').length, 1) // 名称命中
  assert.equal(filterScenes(scenes, '四维').length, 1) // 描述命中
  assert.equal(filterScenes(scenes, 'wiki_query').length, 1) // 提示词命中
  assert.equal(filterScenes(scenes, '检索').length, 1) // 同一场景多处命中仍只算一条
  assert.equal(filterScenes(scenes, '代码').length, 1) // 名称+提示词同场景
  assert.equal(filterScenes(scenes, '没有的').length, 0)
  assert.equal(filterScenes(scenes, '').length, 3) // 空查询全量
  assert.equal(filterScenes(scenes, '  ').length, 3)
})

test('filterVars 按名称/值过滤', () => {
  const vars = [
    { name: '项目', value: 'iobs_pro', updatedAt: '' },
    { name: '范围', value: '代码审查', updatedAt: '' },
  ]
  assert.equal(filterVars(vars, '项目').length, 1)
  assert.equal(filterVars(vars, 'iobs').length, 1) // 值命中
  assert.equal(filterVars(vars, '代码审查').length, 1)
  assert.equal(filterVars(vars, 'project').length, 0)
  assert.equal(filterVars(vars, '').length, 2)
})

test('buildSceneEdit 表单合并与 id 生成（固定底部操作栏的保存入口）', () => {
  const base = { id: 'a', name: 'A', description: 'd', prompt: 'p', operationManual: 'old', builtin: false, updatedAt: 't' }
  // 编辑已有场景：保留原 id，业务字段整体替换
  assert.deepEqual(
    buildSceneEdit(base, { name: 'A2', description: 'd2', prompt: 'p2', operationManual: 'new' }, ['a', 'b']),
    { id: 'a', name: 'A2', description: 'd2', prompt: 'p2', operationManual: 'new', builtin: false, updatedAt: 't' },
  )
  // 新增场景：base.id 为空 → 用名称净化生成不冲突 id（uniqueId 逻辑）
  const created = buildSceneEdit(
    { id: '', name: '', description: '', prompt: '', operationManual: '', builtin: false, updatedAt: '' },
    { name: '知识检索 场景!', description: '', prompt: 'p', operationManual: '# 手册' },
    ['知识检索-场景'],
  )
  assert.equal(created.id, '知识检索-场景-2')
  assert.equal(created.name, '知识检索 场景!') // 名称原样保留，仅 id 净化
  assert.equal(created.prompt, 'p')
  assert.equal(created.operationManual, '# 手册')
  assert.equal(created.builtin, false)
})

test('buildVarEdit 变量表单合并与去空白', () => {
  const base = { name: 'x', value: 'v', updatedAt: 't' }
  assert.deepEqual(buildVarEdit(base, { name: ' 需求 ', value: ' 1 ' }), { name: '需求', value: '1', updatedAt: 't' })
  // 新增（空 base）：trim 后写入
  assert.deepEqual(buildVarEdit({ name: '', value: '', updatedAt: '' }, { name: '范围', value: '全局' }), { name: '范围', value: '全局', updatedAt: '' })
})
