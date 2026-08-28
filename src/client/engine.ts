// src/client/engine.ts
// 场景引擎纯函数：变量提取/替换、场景校验、id 净化。浏览器与测试共用。
import { SAFE_ID, type Scene } from '../types.ts'

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

/** 校验场景对象：缺字段 / 非法 id / 空 name / 空 prompt → null。 */
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
