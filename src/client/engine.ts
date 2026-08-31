// src/client/engine.ts
// 场景引擎纯函数：变量提取/替换、场景校验、id 净化、变量库校验。浏览器与测试共用。
import { SAFE_ID, type PromptVar, type Scene } from '../types.ts'

/** 变量占位符：{名称} */
export const VAR_RE = /[{]([^{}]+)[}]/g

/** 提取提示词中的变量名（去重、去空白）。 */
export function extractVariables(prompt: string): string[] {
  const out: string[] = []
  for (const m of prompt.matchAll(VAR_RE)) {
    const name = m[1].trim()
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

/** 用 values 替换 {变量}；缺失或空值保持原占位符。 */
export function fillPrompt(prompt: string, values: Record<string, string>): string {
  return prompt.replace(VAR_RE, (raw, name: string) => {
    const v = values[name.trim()]
    return v !== undefined && v !== '' ? v : raw
  })
}

/** 校验场景对象：缺字段 / 非法 id / 空 name / 空 prompt → null。seedPrompt 透传保留。 */
export function validateScene(raw: unknown): Scene | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (typeof s.id !== 'string' || !SAFE_ID.test(s.id)) return null
  if (typeof s.name !== 'string' || !s.name.trim()) return null
  if (typeof s.prompt !== 'string' || !s.prompt.trim()) return null
  return {
    id: s.id,
    name: s.name,
    description: typeof s.description === 'string' ? s.description : '',
    prompt: s.prompt,
    builtin: s.builtin === true,
    updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : '',
    ...(typeof s.seedPrompt === 'string' ? { seedPrompt: s.seedPrompt } : {}),
  }
}

/** 把用户输入的名称净化为合法场景 id（非法字符→-，全非法则回退 scene-<时间戳36进制>）。 */
export function sanitizeId(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'scene-' + Date.now().toString(36)
}

/** 场景应用决策：当前会话是否空白 × 是否有新建会话通道（workspaces）。 */
export type SceneAction = 'fill-here' | 'start-new'

/**
 * 决策表（Task 4 规格）：
 * - 空白会话 → 原地填充（fill-here），无论通道是否存在；
 * - 非空白 + 有 workspaces → 挂起填充并 startSession() 切同工作区新空白会话（start-new）；
 * - 非空白 + 无 workspaces → 兜底填当前会话（fill-here），用户可直接发送。
 */
export function resolveSceneAction(sessionBlank: boolean, hasWorkspaces: boolean): SceneAction {
  if (sessionBlank) return 'fill-here'
  return hasWorkspaces ? 'start-new' : 'fill-here'
}

/** 为新场景生成不冲突的合法 id（净化 + 冲突时追加 -2/-3/…）。 */
export function uniqueId(name: string, existingIds: readonly string[]): string {
  const base = sanitizeId(name)
  let id = base
  for (let i = 2; existingIds.includes(id); i++) id = `${base}-${i}`
  return id
}

/**
 * 管理弹窗脏检查：草稿与原始快照是否有未保存的修改（关闭弹窗丢弃守卫用）。
 * 只比较业务字段（id/name/description/prompt/builtin）——updatedAt 由服务端
 * 在落盘时刷新、seedPrompt 是内部基线，都不算用户修改。
 */
export function hasDirtyScenes(original: readonly Scene[], drafts: readonly Scene[]): boolean {
  if (original.length !== drafts.length) return true
  const key = (s: Scene): string =>
    JSON.stringify([s.id, s.name, s.description, s.prompt, s.builtin])
  const baseline = new Set(original.map(key))
  return drafts.some((d) => !baseline.has(key(d)))
}

/** 草稿写回：新增（sel='new'）追加，编辑按 id 替换；返回新草稿列表（不可变）。 */
export function applyDraftEdit(drafts: readonly Scene[], sel: string | 'new', next: Scene): Scene[] {
  return sel === 'new' ? [...drafts, next] : drafts.map((d) => (d.id === sel ? next : d))
}

/** 草稿删除：按 id 过滤；返回新草稿列表（不可变）。 */
export function applyDraftRemove(drafts: readonly Scene[], id: string): Scene[] {
  return drafts.filter((d) => d.id !== id)
}

/** 校验变量条目：name 与 value 均非空（trim 后）→ PromptVar；否则 null。 */
export function validateVar(raw: unknown): PromptVar | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  if (typeof v.name !== 'string' || !v.name.trim()) return null
  if (typeof v.value !== 'string' || !v.value.trim()) return null
  return {
    name: v.name.trim(),
    value: v.value.trim(),
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : '',
  }
}

/** 变量名是否重复（大小写不敏感）：PUT 前拦截，防止同名覆盖歧义。 */
export function hasDuplicateVarNames(vars: readonly PromptVar[]): boolean {
  const seen = new Set<string>()
  for (const v of vars) {
    const key = v.name.toLowerCase()
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}

/** 在变量库中按变量名（trim + 大小写不敏感）查找条目；库缺失返回 null。 */
export function findVar(vars: readonly PromptVar[] | null, name: string): PromptVar | null {
  if (!vars) return null
  const key = name.trim().toLowerCase()
  return vars.find((v) => v.name.toLowerCase() === key) ?? null
}

/** 变量库脏检查：比较业务字段（name/value），updatedAt 不算用户修改。 */
export function hasDirtyVars(original: readonly PromptVar[], drafts: readonly PromptVar[]): boolean {
  if (original.length !== drafts.length) return true
  const key = (v: PromptVar): string => JSON.stringify([v.name.toLowerCase(), v.value])
  const baseline = new Set(original.map(key))
  return drafts.some((d) => !baseline.has(key(d)))
}

/** 模糊匹配：大小写不敏感子串；空查询视为全量命中。 */
export function matchesFuzzy(text: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return text.toLowerCase().includes(q)
}

/** 按查询过滤场景：名称/描述/提示词任一命中即算；空查询返回全部。 */
export function filterScenes(scenes: readonly Scene[], query: string): Scene[] {
  const q = query.trim()
  if (!q) return [...scenes]
  return scenes.filter((s) =>
    matchesFuzzy(s.name, q) || matchesFuzzy(s.description, q) || matchesFuzzy(s.prompt, q))
}

/** 按查询过滤变量：名称或值命中即算；空查询返回全部。 */
export function filterVars(vars: readonly PromptVar[], query: string): PromptVar[] {
  const q = query.trim()
  if (!q) return [...vars]
  return vars.filter((v) =>
    matchesFuzzy(v.name, q) || matchesFuzzy(v.value, q))
}

/** 挂起填充有效期：超过后丢弃（startSession 失败时不误填之后手动新建的会话）。 */
export const PENDING_TTL_MS = 15_000

/**
 * 到达窗口：startSession 的导航是亚秒级的 SPA 切换，新会话挂载应在窗口内完成。
 * 窗口外才到达的挂载，多半是用户手动切到了别的空白会话——不得误填。
 * 根治需要 workspaces.startSession 返回新会话 id 供精确匹配（宿主 API 增强，
 * 超出插件改动范围），先用到达窗口把误填暴露面从 15s 收窄到 5s。
 */
export const PENDING_ARRIVAL_MS = 5_000

/**
 * 挂起填充是否可在当前挂载的会话上落地：
 * - 会话必须空白（blank）；
 * - 必须在到达窗口内（PENDING_ARRIVAL_MS，见上）；
 * - mountId 与 fromId 都必须存在且不同（确认为新会话，而非同一会话重挂载）。
 * 无法确认会话身份（任一缺失）时保守拒绝。
 */
export function isPendingFillEligible(
  sessionBlank: boolean,
  elapsedMs: number,
  fromSessionId: string | undefined,
  mountSessionId: string | undefined,
): boolean {
  if (!sessionBlank) return false
  if (elapsedMs > PENDING_ARRIVAL_MS) return false
  if (mountSessionId === undefined || fromSessionId === undefined) return false
  return mountSessionId !== fromSessionId
}
