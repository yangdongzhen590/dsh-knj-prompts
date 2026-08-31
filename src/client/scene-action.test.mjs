// scene-action.test.mjs
// Task 4 场景应用决策 + 新增 id 去重 + 挂起填充资格（红绿测试：Node 24 原生 TS strip 直接 import 源文件）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSceneAction, uniqueId, isPendingFillEligible, hasDirtyScenes, applyDraftEdit, applyDraftRemove, PENDING_TTL_MS, PENDING_ARRIVAL_MS } from './engine.ts'

test('resolveSceneAction 决策表', () => {
  // 空白会话：无论有没有新建通道，都原地填充
  assert.equal(resolveSceneAction(true, true), 'fill-here')
  assert.equal(resolveSceneAction(true, false), 'fill-here')
  // 非空白 + 有 workspaces：挂起并切新会话（官方 New Session 通道）
  assert.equal(resolveSceneAction(false, true), 'start-new')
  // 非空白 + 无 workspaces：兜底填当前会话（规格约定，不白选一场）
  assert.equal(resolveSceneAction(false, false), 'fill-here')
})

test('uniqueId 去重与净化', () => {
  assert.equal(uniqueId('知识检索', []), '知识检索')
  assert.equal(uniqueId('知识检索 场景!', ['知识检索-场景']), '知识检索-场景-2')
  assert.equal(uniqueId('同名', ['同名', '同名-2', '同名-3']), '同名-4')
  // 全非法名回退 sanitizeId 的 scene-<时间戳36进制>
  assert.match(uniqueId('---', []), /^scene-[a-z0-9]+$/)
})

test('isPendingFillEligible 挂起填充资格（到达窗口 + TTL + 会话差量守卫）', () => {
  const ttl = PENDING_TTL_MS
  const arrival = PENDING_ARRIVAL_MS
  // 到达窗口内 + 会话切换（mountId ≠ fromId）+ 空白 → 可消费
  assert.equal(isPendingFillEligible(true, arrival - 1, 's1', 's2'), true)
  // 超过到达窗口（即使仍在 TTL 内）→ 不可消费：
  // startSession 的导航是亚秒级的，迟迟未到的挂载多半是用户手动切到别的空白会话，不得误填
  assert.equal(isPendingFillEligible(true, arrival + 1, 's1', 's2'), false,
    '到达窗口外不得消费（防手动切换误填）')
  assert.equal(isPendingFillEligible(true, ttl + 1, 's1', 's2'), false)
  // 非空白 → 不可消费
  assert.equal(isPendingFillEligible(false, 100, 's1', 's2'), false)
  // 同一会话重挂载（mountId === fromId）→ 不可消费（不是新会话）
  assert.equal(isPendingFillEligible(true, 100, 's1', 's1'), false)
  // 无会话身份（fromId 缺失）→ 保守不允许
  assert.equal(isPendingFillEligible(true, 100, undefined, 's2'), false)
  assert.equal(isPendingFillEligible(true, 100, 's1', undefined), false)
})

test('hasDirtyScenes 管理弹窗脏检查（关闭丢弃守卫用）', () => {
  const base = [
    { id: 'a', name: 'A', description: 'd1', prompt: 'p1', builtin: true, updatedAt: 't1' },
    { id: 'b', name: 'B', description: 'd2', prompt: 'p2', builtin: false, updatedAt: 't2' },
  ]
  // 业务字段相同（仅 updatedAt 不同，如服务器落盘刷新时间戳）→ 不算未保存修改
  assert.equal(hasDirtyScenes(base, base.map((s) => ({ ...s, updatedAt: 'newer' }))), false)
  // 完全一致 → 不脏
  assert.equal(hasDirtyScenes(base, base.map((s) => ({ ...s }))), false)
  // 改 name / description / prompt → 脏
  assert.equal(hasDirtyScenes(base, [{ ...base[0], name: 'A2' }, { ...base[1] }]), true)
  assert.equal(hasDirtyScenes(base, [{ ...base[0], description: 'dd' }, { ...base[1] }]), true)
  assert.equal(hasDirtyScenes(base, [{ ...base[0] }, { ...base[1], prompt: 'p3' }]), true)
  // 新增 / 删除 → 脏
  assert.equal(hasDirtyScenes(base, [...base, { id: 'c', name: 'C', description: '', prompt: 'p', builtin: false, updatedAt: '' }]), true)
  assert.equal(hasDirtyScenes(base, [base[0]]), true)
  // 空列表对空列表 → 不脏
  assert.equal(hasDirtyScenes([], []), false)
})

test('applyDraftEdit / applyDraftRemove 管理弹窗草稿写回（单步保存）', () => {
  const base = [
    { id: 'a', name: 'A', description: 'd1', prompt: 'p1', builtin: true, updatedAt: 't1' },
    { id: 'b', name: 'B', description: 'd2', prompt: 'p2', builtin: false, updatedAt: 't2' },
  ]
  // 编辑：按 id 替换，其余不动
  const edited = applyDraftEdit(base, 'a', { ...base[0], name: 'A2', prompt: 'p1-改' })
  assert.equal(edited.length, 2)
  assert.equal(edited[0].id, 'a')
  assert.equal(edited[0].name, 'A2')
  assert.equal(edited[0].prompt, 'p1-改')
  assert.equal(edited[1].id, 'b')
  // 新增（sel='new'）：追加
  const added = applyDraftEdit(base, 'new', { id: 'c', name: 'C', description: '', prompt: 'p3', builtin: false, updatedAt: '' })
  assert.equal(added.length, 3)
  assert.equal(added[2].id, 'c')
  // 不可变：原数组不被修改
  assert.equal(base[0].name, 'A')
  assert.equal(base.length, 2)
  // 删除：按 id 过滤
  const removed = applyDraftRemove(base, 'a')
  assert.equal(removed.length, 1)
  assert.equal(removed[0].id, 'b')
  assert.equal(base.length, 2)
})
