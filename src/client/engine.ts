// src/client/engine.ts
// 场景引擎纯函数：变量提取/替换、场景校验、id 净化、变量库校验。浏览器与测试共用。
import { SAFE_ID, normalizeVarOptions, type PromptVar, type Scene, type VarOption } from '../types.ts'

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
  if ('operationManual' in s && typeof s.operationManual !== 'string') return null
  return {
    id: s.id,
    name: s.name,
    description: typeof s.description === 'string' ? s.description : '',
    prompt: s.prompt,
    operationManual: typeof s.operationManual === 'string' ? s.operationManual : '',
    builtin: s.builtin === true,
    favorite: s.favorite === true,
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

/**
 * 为 exporter 组装已选场景的明确草稿。场景数据以内嵌 JSON 交给 skill，避免 AI 再反问选择目标。
 * 只携带场景包所需字段，不带 builtin、时间戳或源环境运行配置。
 */
export function buildScenePackageExportDraft(exporterPrompt: string, scene: Scene): string {
  const selectedScene = JSON.stringify({
    id: scene.id,
    name: scene.name,
    description: scene.description,
    prompt: scene.prompt,
    operationManual: scene.operationManual,
  })
  return `${exporterPrompt.replace('先询问我要导出的场景；', '')}\n\n已在插件中选择要导出的普通场景。不要再询问选择目标；直接以以下 JSON 作为 scene.json 的来源，并按其中 operationManual 制定预览计划：\n\n\`\`\`json\n${selectedScene}\n\`\`\``
}

/** 场景应用决策：当前会话是否空白 × 是否有新建会话通道（workspaces）。 */
export type SceneAction = 'fill-here' | 'start-new'

/**
 * 宿主会话身份的最小子集（决定「原地填充」还是「开新会话再填充」）。
 * 只含决策真正需要的两项，避免把整个宿主快照类型拖进客户端组件。
 */
export interface SessionSnapshotLike {
  readonly sessionId?: string
  /** 空日志位：该会话还没被任何已接受的首条 prompt 消费。 */
  readonly blank?: boolean
}

/**
 * 当前会话身份。身份不可得时整体为 undefined——**不得**用一半来源拼合：
 * 判定「开新会话」要求 blank 与 sessionId 都可信，否则宁可不判定。
 */
export interface SessionIdentity {
  readonly sessionId?: string
  readonly blank: boolean
}

/**
 * 从宿主给的两条通道解析当前会话身份：
 * - owner share（`conversation.input.dock` 的 InputZone）直接给 `session`；
 * - session 作用域**标准套件**给 `useSession`（`@deepseek-ai/dsh-client-ui-session`
 *   的 SessionStandardProps，与已在本插件生效的 `inputActions` 同源）。
 *
 * 实测 0.1.2-rc.1：`conversation.input.right` 由 InputBar 以 `renderSlot(name, {})`
 * 渲染，且其插槽声明**无 owner**，因此 owner share 永远不达 input.right；
 * 标准套件才是该位置唯一可用的会话身份来源。
 * 任一来源给出会话身份即采纳；两者皆无 → undefined（调用方保守原地填充）。
 */
export function readSessionIdentity(
  ownerSession: SessionSnapshotLike | undefined,
  standardSession: SessionSnapshotLike | undefined,
): SessionIdentity | undefined {
  const snapshot = ownerSession ?? standardSession
  if (snapshot === undefined || typeof snapshot.blank !== 'boolean') return undefined
  return { sessionId: snapshot.sessionId, blank: snapshot.blank }
}

/** 场景填充去处（与 SceneAction 区分：这里只回答「草稿写哪儿」）。 */
export type SceneFillTarget = 'current-composer' | 'new-session'

/**
 * 新建会话能力（已解析、必然可调用）。只有一条通道：`uiWorkspace.startSession`
 * —— 与宿主「新建会话」同一条路径（复用同工作区的空白会话，没有则新建，并导航过去）。
 *
 * 0.2.1-rc.2 起 `startSession` 接受 `{ prompt, clearPreviousDraft }`：宿主在
 * `openWorkspace` 的 `beforeOpen` 里、**导航发布之前**按会话身份把草稿写进目标会话
 * （`conversation.input.requestDraftInitialization`）。所以「开新会话并填充」是一次
 * 调用，不再需要「先跳转、再等新会话挂载补填」的跨挂载通道。
 */
export interface SceneSessionStarter {
  /**
   * 开新会话并把草稿一起交给宿主。
   * @param prompt - 写进目标会话草稿的完整文本。
   * @param workspaceId - 目标工作区；省略时由宿主继承当前/最近工作区。
   */
  start(prompt: string, workspaceId?: string): void
}

/** `ctx.get(name)` 的最小结构面（cordis 服务解析）；宿主可能根本没有 get，故可选。 */
export interface ServiceResolver {
  get?(name: string): unknown
}

function isCallable(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function'
}

/**
 * 解析「新建会话」能力：**只认 `uiWorkspace.startSession`，且必须方法级可调用**。
 *
 * 为什么不「服务存在即算有通道」：本机实测 `ctx.get('workspaces')` 返回的是
 * **Workspace 控制器**（`IWorkspaces` 只有 list/create/rename/delete/insert 系列，
 * 压根没有会话方法），只判 `!== undefined` 会让调用点直接抛
 * `workspaces.startSession is not a function` —— 用户侧表现为「选场景就报错」。
 * 不可调用时返回 undefined，由 decideSceneFill 降级为原地填充（不白选一场场景）。
 *
 * 旧的 `sessions.create() + open()` 兜底已删除：0.2.1-rc.2 的 `ISessions` 不再暴露
 * `open`（导航归属 `uiWorkspace.openSession`），那段代码在新宿主上永远不命中，
 * 只是假安全网；继续留着会让「降级为原地填充」看起来像有后备通道。
 */
export function resolveSceneSessionStarter(
  ctx: ServiceResolver | undefined,
): SceneSessionStarter | undefined {
  const lookup = (name: string): unknown => {
    const get = ctx?.get
    if (typeof get !== 'function') return undefined
    try {
      return get.call(ctx, name)
    } catch {
      return undefined
    }
  }

  const uiWorkspace = lookup('uiWorkspace') as { startSession?: unknown } | undefined
  if (uiWorkspace === undefined || !isCallable(uiWorkspace.startSession)) return undefined

  type StartSession = (
    workspaceId?: string,
    options?: { prompt?: string; clearPreviousDraft?: boolean },
  ) => unknown
  const startSession = uiWorkspace.startSession as StartSession
  return {
    start: (prompt: string, workspaceId?: string) => {
      // 与宿主 UI 同款调用约定：startSession 挂在服务实例上，需保留 this；
      // 也不替宿主吞异常（宿主内部 .catch + 通知，与它自己的 New Session 一致）。
      // clearPreviousDraft：目标空白会话若残留文本，宿主默认「保留」并静默丢弃本次
      // 场景文本（requestDraftInitialization → 'preserved'）；本插件既有语义是覆盖
      // （原 setDraft 无条件替换），故显式声明清空。
      startSession.call(uiWorkspace, workspaceId, { prompt, clearPreviousDraft: true })
    },
  }
}

/**
 * 场景填充决策（纯函数，可测）：
 * - 会话身份不可得（宿主未注入任何通道）→ 原地填充：不能安全挂起跨会话填充，
 *   保守地写当前草稿，绝不静默丢弃用户选中的场景；
 * - 会话空白 → 原地填充（空白会话会被 New Session 复用，另开一个只会白留一个是空壳）；
 * - 会话非空白且新建会话能力**可调用** → 开新会话再填充（本插件的主用例）。
 */
export function decideSceneFill(
  identity: SessionIdentity | undefined,
  hasStartSession: boolean,
): SceneFillTarget {
  if (identity === undefined) return 'current-composer'
  return resolveSceneAction(identity.blank, hasStartSession) === 'start-new'
    ? 'new-session'
    : 'current-composer'
}

/**
 * 决策表（Task 4 规格，`hasWorkspaces` 语义已更正为「新建会话能力可调用」）：
 * - 空白会话 → 原地填充（fill-here），无论通道是否存在；
 * - 非空白 + 能力可用 → 挂起填充并切同工作区新空白会话（start-new）；
 * - 非空白 + 能力不可用 → 兜底填当前会话（fill-here），用户可直接发送。
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
 * 只比较业务字段（id/name/description/prompt/builtin/favorite）——updatedAt 由服务端
 * 在落盘时刷新、seedPrompt 是内部基线，都不算用户修改。
 */
export function hasDirtyScenes(original: readonly Scene[], drafts: readonly Scene[]): boolean {
  if (original.length !== drafts.length) return true
  const key = (s: Scene): string =>
    JSON.stringify([s.id, s.name, s.description, s.prompt, s.operationManual, s.builtin, s.favorite])
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

/** 校验变量条目：名称必填；枚举条目（options 非空）允许 value 为空，单值条目 value 必填。 */
export function validateVar(raw: unknown): PromptVar | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  if (typeof v.name !== 'string' || !v.name.trim()) return null
  if (v.options !== undefined && v.options !== null && !Array.isArray(v.options)) return null
  const rawOptions = Array.isArray(v.options) ? v.options : []
  const value = typeof v.value === 'string' ? v.value.trim() : ''
  const updatedAt = typeof v.updatedAt === 'string' ? v.updatedAt : ''
  if (rawOptions.length > 0) {
    const options = normalizeVarOptions(rawOptions)
    // 有选项但存在缺值项 → 整条拒绝，不静默丢弃用户数据
    if (options.length !== rawOptions.length) return null
    return { name: v.name.trim(), value, options, updatedAt }
  }
  if (!value) return null
  return { name: v.name.trim(), value, updatedAt }
}

/** 是否为枚举变量（至少一个合法候选项）。 */
export function isEnumVar(v: PromptVar): boolean {
  return normalizeVarOptions(v.options).length > 0
}

/** 归一后的枚举候选项；单值变量返回空数组。 */
export function varOptions(v: PromptVar): VarOption[] {
  return normalizeVarOptions(v.options)
}

/**
 * 级联第一级：可选变量列表（先选变量，再选值）。
 * 过滤通道：变量名命中，或其枚举显示名/实际值命中（便于一步直达所属变量）。
 * 无值且无选项的空变量不出现；null 变量库返回空列表。
 */
export function varPickGroups(vars: readonly PromptVar[] | null, query: string): PromptVar[] {
  if (!vars) return []
  const usable = vars.filter((v) => normalizeVarOptions(v.options).length > 0 || v.value.trim().length > 0)
  const q = query.trim().toLowerCase()
  if (!q) return usable
  return usable.filter((v) => {
    if (v.name.toLowerCase().includes(q)) return true
    if (v.value.toLowerCase().includes(q)) return true
    return normalizeVarOptions(v.options).some((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
  })
}

/** 级联第二级：某变量的可选值（枚举候选，按显示名/实际值过滤）；单值变量返回空数组。 */
export function varPickOptions(v: PromptVar, query: string): VarOption[] {
  const options = normalizeVarOptions(v.options)
  const q = query.trim().toLowerCase()
  if (!q) return options
  return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
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

/** 变量库脏检查：比较业务字段（name/value/options），updatedAt 不算用户修改。 */
export function hasDirtyVars(original: readonly PromptVar[], drafts: readonly PromptVar[]): boolean {
  if (original.length !== drafts.length) return true
  const key = (v: PromptVar): string =>
    JSON.stringify([v.name.toLowerCase(), v.value, normalizeVarOptions(v.options)])
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

/** 稳定显示分组：收藏优先，其次未收藏内置场景，最后为其余场景。 */
export function sortScenesForDisplay(scenes: readonly Scene[]): Scene[] {
  const group = (scene: Scene): number => scene.favorite ? 0 : scene.builtin ? 1 : 2
  return scenes
    .map((scene, index) => ({ scene, index }))
    .sort((a, b) => group(a.scene) - group(b.scene) || a.index - b.index)
    .map(({ scene }) => scene)
}

/** 对列表分页；页码钳制到有效范围，默认每页十项。 */
export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize = 10,
): { items: T[]; page: number; pageCount: number; total: number } {
  const total = items.length
  const size = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 10
  const pageCount = Math.max(1, Math.ceil(total / size))
  const safePage = Number.isFinite(page) ? Math.min(Math.max(1, Math.floor(page)), pageCount) : 1
  const start = (safePage - 1) * size
  return { items: items.slice(start, start + size), page: safePage, pageCount, total }
}

/** 按查询过滤变量：名称或值命中即算；空查询返回全部。 */
export function filterVars(vars: readonly PromptVar[], query: string): PromptVar[] {
  const q = query.trim()
  if (!q) return [...vars]
  return vars.filter((v) =>
    matchesFuzzy(v.name, q) || matchesFuzzy(v.value, q))
}

/** 场景编辑表单（管理弹窗固定底部操作栏的受控输入）。 */
export interface SceneForm { name: string; description: string; prompt: string; operationManual: string }

/**
 * 把编辑表单合并进场景草稿：编辑保留原 id；新增（base.id 为空）用名称净化
 * 生成不冲突 id（uniqueId）。供管理弹窗固定底部操作栏的「保存修改」使用。
 */
export function buildSceneEdit(base: Scene, form: SceneForm, existingIds: readonly string[]): Scene {
  return {
    ...base,
    id: base.id || uniqueId(form.name, existingIds),
    name: form.name,
    description: form.description,
    prompt: form.prompt,
    operationManual: form.operationManual,
  }
}

/** 变量编辑表单（管理弹窗固定底部操作栏的受控输入）。options 空数组 = 单值变量。 */
export interface VarForm { name: string; value: string; options: VarOption[] }

/**
 * 把变量编辑表单合并进变量条目：name/value 去空白，选项归一。
 * 选项为空时不再落 options 字段（回到单值语义），避免残留旧枚举。
 */
export function buildVarEdit(base: PromptVar, form: VarForm): PromptVar {
  const options = normalizeVarOptions(form.options)
  const next: PromptVar = { name: form.name.trim(), value: form.value.trim(), updatedAt: base.updatedAt }
  if (options.length > 0) next.options = options
  return next
}

/** 表单是否可保存：名称必填；枚举需至少一个带值选项，且不允许存在缺值选项行。 */
export function validateVarForm(form: VarForm | null): boolean {
  if (!form) return false
  if (!form.name.trim()) return false
  const rows = Array.isArray(form.options) ? form.options : []
  if (rows.length > 0) return normalizeVarOptions(rows).length === rows.length
  return form.value.trim().length > 0
}
