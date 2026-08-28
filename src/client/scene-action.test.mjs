// scene-action.test.mjs
// Task 4 场景应用决策 + 新增 id 去重 + 挂起填充资格（红绿测试：Node 24 原生 TS strip 直接 import 源文件）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSceneAction, uniqueId, isPendingFillEligible, PENDING_TTL_MS } from './engine.ts'

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

test('isPendingFillEligible 挂起填充资格（TTL + 会话差量守卫）', () => {
  const ttl = PENDING_TTL_MS
  // 会话切换（mountId ≠ fromId）且空白且在 TTL 内 → 可消费
  assert.equal(isPendingFillEligible(true, ttl - 1, 's1', 's2'), true)
  // 超 TTL → 不可消费（不误填迟到的手动会话）
  assert.equal(isPendingFillEligible(true, ttl + 1, 's1', 's2'), false)
  // 非空白 → 不可消费
  assert.equal(isPendingFillEligible(false, 100, 's1', 's2'), false)
  // 同一会话重挂载（mountId === fromId）→ 不可消费（不是新会话）
  assert.equal(isPendingFillEligible(true, 100, 's1', 's1'), false)
  // 无会话身份（fromId 缺失）→ 保守不允许
  assert.equal(isPendingFillEligible(true, 100, undefined, 's2'), false)
  assert.equal(isPendingFillEligible(true, 100, 's1', undefined), false)
})
