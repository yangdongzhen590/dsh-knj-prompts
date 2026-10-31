// scene-action.test.mjs
// Task 4 场景应用决策 + 新增 id 去重 + 挂起填充资格（红绿测试：Node 24 原生 TS strip 直接 import 源文件）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildScenePackageExportDraft, decideSceneFill, readSessionIdentity, resolveSceneSessionStarter, resolveSceneAction, uniqueId, hasDirtyScenes, hasDirtyVars, applyDraftEdit, applyDraftRemove, buildVarEdit, validateVar, sortScenesForDisplay, paginate, isEnumVar, varOptions, validateVarForm, varPickGroups, varPickOptions } from './engine.ts'
import * as engine from './engine.ts'

test('sortScenesForDisplay 稳定地按 favorite、内置、其余分组', () => {
  const scenes = [
    { id: 'ordinary-1', name: '普通一', description: '', prompt: 'p', operationManual: '', favorite: false, builtin: false, updatedAt: '' },
    { id: 'builtin-1', name: '内置一', description: '', prompt: 'p', operationManual: '', favorite: false, builtin: true, updatedAt: '' },
    { id: 'favorite-1', name: '收藏一', description: '', prompt: 'p', operationManual: '', favorite: true, builtin: false, updatedAt: '' },
    { id: 'builtin-2', name: '内置二', description: '', prompt: 'p', operationManual: '', favorite: false, builtin: true, updatedAt: '' },
    { id: 'favorite-2', name: '收藏二', description: '', prompt: 'p', operationManual: '', favorite: true, builtin: true, updatedAt: '' },
    { id: 'ordinary-2', name: '普通二', description: '', prompt: 'p', operationManual: '', favorite: false, builtin: false, updatedAt: '' },
  ]
  assert.deepEqual(sortScenesForDisplay(scenes).map((scene) => scene.id), [
    'favorite-1', 'favorite-2', 'builtin-1', 'builtin-2', 'ordinary-1', 'ordinary-2',
  ])
  assert.deepEqual(scenes.map((scene) => scene.id), [
    'ordinary-1', 'builtin-1', 'favorite-1', 'builtin-2', 'favorite-2', 'ordinary-2',
  ])
})

test('paginate 默认每页十条并钳制页码', () => {
  const items = Array.from({ length: 21 }, (_, index) => index + 1)
  assert.deepEqual(paginate(items, 1), { items: items.slice(0, 10), page: 1, pageCount: 3, total: 21 })
  assert.deepEqual(paginate(items, 2), { items: items.slice(10, 20), page: 2, pageCount: 3, total: 21 })
  assert.deepEqual(paginate(items, 3), { items: items.slice(20), page: 3, pageCount: 3, total: 21 })
  assert.equal(paginate(items, 99).page, 3)
  assert.equal(paginate(items, 0).page, 1)
})

/**
 * 回归：0.1.2-rc.1 宿主的 `conversation.input.right` 由 InputBar 以
 * `renderSlot("conversation.input.right", {})` 渲染，其插槽声明无 owner，InputZone
 * owner share 永远不达该位置 —— 因此 `props.session` 恒为 undefined。
 * 曾经据此写下的「缺 owner share 就地填入草稿」兜底，使「新会话并填充」退化为
 * 填充当前会话（缺陷本体）。会话身份必须取自 session 作用域标准套件 useSession
 * （与已生效的 inputActions 同源：ctx.uiSession.provide props:['inputActions']）。
 */
test('readSessionIdentity 以 owner share 优先、标准套件兜底，身份不全则拒绝', () => {
  // 标准套件通道（本宿主真实来源）：owner share 缺失也拿到身份
  assert.deepEqual(readSessionIdentity(undefined, { sessionId: 's1', blank: false }), { sessionId: 's1', blank: false })
  assert.deepEqual(readSessionIdentity(undefined, { sessionId: 's2', blank: true }), { sessionId: 's2', blank: true })
  // owner share 优先（将来宿主下放到工具行时以它为准）
  assert.deepEqual(
    readSessionIdentity({ sessionId: 'owner', blank: false }, { sessionId: 'std', blank: true }),
    { sessionId: 'owner', blank: false })
  // 两条通道都缺 → 身份不可得（调用方保守原地填充，绝不误开新会话）
  assert.equal(readSessionIdentity(undefined, undefined), undefined)
  // blank 非布尔（未定型快照）→ 不采信，不半拼合身份
  assert.equal(readSessionIdentity(undefined, { sessionId: 's3' }), undefined)
  assert.equal(readSessionIdentity({ sessionId: 's4', blank: undefined }, undefined), undefined)
})

test('decideSceneFill：非空白且有新建通道才开新会话', () => {
  // 本插件主用例：非空白 + 有 workspaces → 新会话再填充（修复前这里恒为 current-composer）
  assert.equal(decideSceneFill({ sessionId: 's1', blank: false }, true), 'new-session')
  // 空白会话：原地填充（New Session 会复用它，另开只会白留一个空壳）
  assert.equal(decideSceneFill({ sessionId: 's1', blank: true }, true), 'current-composer')
  // 非空白但宿主无 workspaces：兜底原地填充，不白选一场
  assert.equal(decideSceneFill({ sessionId: 's1', blank: false }, false), 'current-composer')
  // 身份不可得：绝不猜，保守原地填充
  assert.equal(decideSceneFill(undefined, true), 'current-composer')
  assert.equal(decideSceneFill(undefined, false), 'current-composer')
})

test('resolveSceneSessionStarter 只认 uiWorkspace.startSession，并按原生草稿参数调用', () => {
  const fake = (services) => ({ get: (name) => services[name] })

  // 本机实测形态（回归）：`workspaces` 是 Workspace 控制器，**没有** startSession。
  // 曾经只判「服务存在」就让调用点 startSession() → TypeError（用户看到「选场景就报错」）。
  const workspacesOnly = fake({ workspaces: { list: {}, create: () => {}, rename: () => {} } })
  assert.equal(resolveSceneSessionStarter(workspacesOnly), undefined,
    'Workspace 控制器不得被当成新建会话能力（它压根没有会话方法）')
  // 缺失 / 无 ctx / get 抛错 → undefined，不得抛异常
  assert.equal(resolveSceneSessionStarter(fake({})), undefined)
  assert.equal(resolveSceneSessionStarter(undefined), undefined)
  assert.equal(resolveSceneSessionStarter({ get: () => { throw new Error('boom') } }), undefined)

  // 唯一通道：startSession 转发 (workspaceId, { prompt, clearPreviousDraft }) 并保留 this
  const calls = []
  const uiWorkspace = {
    startSession(workspaceId, options) { calls.push({ self: this, workspaceId, options }); return undefined },
  }
  const starter = resolveSceneSessionStarter(fake({ uiWorkspace }))
  assert.ok(starter, 'uiWorkspace.startSession 可调用时应解析成功')
  starter.start('场景文本')
  assert.deepEqual(calls, [{ self: uiWorkspace, workspaceId: undefined,
    options: { prompt: '场景文本', clearPreviousDraft: true } }],
  '必须一次调用把草稿交给宿主（0.2.1 的 DraftInitializationOptions），且显式覆盖旧草稿')
  starter.start('另一段', 'ws-1')
  assert.deepEqual(calls[1], { self: uiWorkspace, workspaceId: 'ws-1',
    options: { prompt: '另一段', clearPreviousDraft: true } })
})

test('resolveSceneSessionStarter 不再伪造兜底通道（sessions.open 已从宿主接口移除）', () => {
  const fake = (services) => ({ get: (name) => services[name] })
  // 旧兜底 sessions.create + open：0.2.1-rc.2 的 ISessions 已无 open，导航归属 uiWorkspace
  assert.equal(resolveSceneSessionStarter(fake({
    sessions: { create: async () => 's-new', open: () => {} },
  })), undefined, 'sessions 不得再被当成新建会话通道（open 已不存在，那只是假安全网）')
  // startSession 非函数 → 直接降级，不转投别的服务
  assert.equal(resolveSceneSessionStarter(fake({
    uiWorkspace: { startSession: 'nope' },
    sessions: { create: async () => 's-new', open: () => {} },
  })), undefined)
  // 模块面不再导出跨挂载补丁 API（删掉的常量/函数不得被重新引入）
  assert.equal('isPendingFillEligible' in engine, false, '挂起填充资格判定应已随通道一起删除')
  assert.equal('PENDING_TTL_MS' in engine, false)
  assert.equal('PENDING_ARRIVAL_MS' in engine, false)
})

test('ScenePicker 从标准套件 useSession 取会话身份，不再依赖 owner share', async () => {
  const source = await readFile(new URL('./ScenePicker.tsx', import.meta.url), 'utf8')
  // 身份解析走 readSessionIdentity（owner share 优先 + useSession 兜底）
  assert.match(source, /const identity = resolveIdentity\(props\)/)
  assert.match(source, /readSessionIdentity\(props\.session, props\.useSession\?\.\(\(snapshot\) => snapshot\)\)/)
  // 填充去处一律经 decideSceneFill 与已校验的能力，禁止复原旧兜底分支
  assert.match(source, /const target = decideSceneFill\(identity, starter !== undefined\)/)
  assert.match(source, /const starter = props\.sessionStarter\?\.\(\)/)
  assert.match(source, /starter\.start\(text\)/, '新会话填充必须一次调用把文本交给宿主（原生草稿注入）')
  assert.doesNotMatch(source, /pendingFill/i, '不得恢复跨挂载挂起填充通道')
  assert.doesNotMatch(source, /PENDING_/, '不得恢复 TTL/到达窗口常量')
  assert.doesNotMatch(source, /sessionBlank/, '不得恢复已删除的 sessionBlank 兜底分支')
  assert.doesNotMatch(source, /workspaces/, '不得再直接读 workspaces 服务（它没有会话方法）')
  // 所有 applySceneText 调用点都必须带上 identity（否则会退回「身份不可得」）
  // 声明处是 `identity: SessionIdentity | undefined,`（冒号），调用点是 `identity,`
  const calls = [...source.matchAll(/applySceneText\(([^)]*?\bidentity,)/g)].map((m) => m[1])
  assert.ok(calls.length >= 4, `应至少 4 个调用点，实际 ${calls.length}`)
  for (const args of calls) assert.match(args, /^props, identity,$/, `调用点缺少 identity：${args}`)
})

test('ScenePicker 的导出选择仅列出普通场景，点击后将选中场景内容交给 exporter', async () => {
  const source = await readFile(new URL('./ScenePicker.tsx', import.meta.url), 'utf8')
  assert.match(source, /type PickerMode = 'menu' \| 'fill' \| 'export-select'/)
  assert.match(source, /if \(s\.id === 'export-scene-package'\) \{\s*setMenuQuery\(''\)\s*setMode\('export-select'\)\s*return\s*\}/s)
  assert.match(source, /renderExportSelection\(scenes, menuQuery, setMenuQuery, exportPage, setExportPage, exportScene\)/)
  assert.match(source, /scenes\.filter\(\(scene\) => !scene\.builtin\)/)

  const ordinary = { id: 'my-scene', name: '我的场景', description: '场景描述', prompt: '执行 {任务}', operationManual: '# 操作', builtin: false, updatedAt: '' }
  const draft = buildScenePackageExportDraft('请调用 exporter。', ordinary)
  assert.match(draft, /"id":"my-scene"/)
  assert.match(draft, /"operationManual":"# 操作"/)
  assert.doesNotMatch(draft, /先询问我要导出的场景/)
})

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

test('填充去处与可用通道一致：没有可调用通道时绝不判定 new-session', () => {
  const fake = (services) => ({ get: (name) => services[name] })
  const noChannel = resolveSceneSessionStarter(fake({}))
  const withChannel = resolveSceneSessionStarter(fake({ uiWorkspace: { startSession() {} } }))
  assert.equal(noChannel, undefined)
  assert.ok(withChannel)
  // 非空白会话：有能力才新开会话，没能力一律原地填（不白选一场场景）
  assert.equal(decideSceneFill({ sessionId: 's1', blank: false }, noChannel !== undefined), 'current-composer')
  assert.equal(decideSceneFill({ sessionId: 's1', blank: false }, withChannel !== undefined), 'new-session')
  // 空白会话不受通道影响：一律原地填（新开会话只会被宿主复用成空壳）
  assert.equal(decideSceneFill({ sessionId: 's1', blank: true }, withChannel !== undefined), 'current-composer')
})

test('hasDirtyScenes 管理弹窗脏检查（关闭丢弃守卫用）', () => {
  const base = [
    { id: 'a', name: 'A', description: 'd1', prompt: 'p1', operationManual: '', builtin: true, updatedAt: 't1' },
    { id: 'b', name: 'B', description: 'd2', prompt: 'p2', operationManual: '', builtin: false, updatedAt: 't2' },
  ]
  // 业务字段相同（仅 updatedAt 不同，如服务器落盘刷新时间戳）→ 不算未保存修改
  assert.equal(hasDirtyScenes(base, base.map((s) => ({ ...s, updatedAt: 'newer' }))), false)
  // 完全一致 → 不脏
  assert.equal(hasDirtyScenes(base, base.map((s) => ({ ...s }))), false)
  // 改 name / description / prompt → 脏
  assert.equal(hasDirtyScenes(base, [{ ...base[0], name: 'A2' }, { ...base[1] }]), true)
  assert.equal(hasDirtyScenes(base, [{ ...base[0], description: 'dd' }, { ...base[1] }]), true)
  assert.equal(hasDirtyScenes(base, [{ ...base[0] }, { ...base[1], prompt: 'p3' }]), true)
  // 改场景包操作说明 → 脏
  assert.equal(hasDirtyScenes(base, [{ ...base[0], operationManual: '# 新说明' }, { ...base[1] }]), true)
  // 新增 / 删除 → 脏
  assert.equal(hasDirtyScenes(base, [...base, { id: 'c', name: 'C', description: '', prompt: 'p', operationManual: '', builtin: false, updatedAt: '' }]), true)
  assert.equal(hasDirtyScenes(base, [base[0]]), true)
  // 空列表对空列表 → 不脏
  assert.equal(hasDirtyScenes([], []), false)
})

test('applyDraftEdit / applyDraftRemove 管理弹窗草稿写回（单步保存）', () => {
  const base = [
    { id: 'a', name: 'A', description: 'd1', prompt: 'p1', operationManual: '', builtin: true, updatedAt: 't1' },
    { id: 'b', name: 'B', description: 'd2', prompt: 'p2', operationManual: '', builtin: false, updatedAt: 't2' },
  ]
  // 编辑：按 id 替换，其余不动
  const edited = applyDraftEdit(base, 'a', { ...base[0], name: 'A2', prompt: 'p1-改' })
  assert.equal(edited.length, 2)
  assert.equal(edited[0].id, 'a')
  assert.equal(edited[0].name, 'A2')
  assert.equal(edited[0].prompt, 'p1-改')
  assert.equal(edited[1].id, 'b')
  // 新增（sel='new'）：追加
  const added = applyDraftEdit(base, 'new', { id: 'c', name: 'C', description: '', prompt: 'p3', operationManual: '', builtin: false, updatedAt: '' })
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

test('三个场景列表都按收藏排序 + 每页 10 条分页', async () => {
  const source = await readFile(new URL('./ScenePicker.tsx', import.meta.url), 'utf8')
  // 下拉菜单：独立页码状态、渲染时排序后分页、行内收藏星标（点击不触发选中）
  assert.match(source, /const \[menuPage, setMenuPage\] = useState\(1\)/)
  assert.match(source, /sortScenesForDisplay\(filterScenes\(scenes, query\)\)/)
  assert.match(source, /event\.stopPropagation\(\);\s*toggleFavorite\(s\.id\)/)
  assert.match(source, /aria-label=\{s\.favorite \? `取消收藏 \$\{s\.name\}` : `收藏 \$\{s\.name\}`\}/)
  // 导出选择：普通场景过滤后同样排序分页
  assert.match(source, /sortScenesForDisplay\(filterScenes\(ordinary, query\)\)/)
  assert.match(source, /const pageData = paginate\(filtered, page\)/)
  // 管理弹窗：列表视图排序分页 + 固定底部保留「新增场景」
  assert.match(source, /const scenePageData = paginate\(sortScenesForDisplay\(sceneSearchHits\), scenePage\)/)
  assert.match(source, /scenePageData\.items\.map/)
  assert.match(source, /新增场景/)
  // 收藏星标按钮共用的 aria-label 出现在管理行内（d.favorite 分支）
  assert.match(source, /aria-label=\{d\.favorite \? `取消收藏 \$\{d\.name\}` : `收藏 \$\{d\.name\}`\}/)
})

// ===== 变量库枚举选项 =====

test('validateVar 支持枚举选项（label/value 成对、value 可空）', () => {
  const options = [{ label: '测试环境1', value: 'https://t1.api' }, { label: '测试环境2', value: 'https://t2.api' }]
  const ok = validateVar({ name: '环境信息', value: '', options, updatedAt: '' })
  assert.equal(ok.name, '环境信息')
  assert.equal(ok.value, '')
  assert.deepEqual(ok.options, options, '选项顺序与内容必须保留')
  // 空 label 回退为 value（显示名不丢）
  assert.deepEqual(validateVar({ name: 'x', value: '', options: [{ label: '  ', value: 'v1' }] }).options, [{ label: 'v1', value: 'v1' }])
  // 选项缺值 → 整条拒绝（不允许静默丢弃用户数据）
  assert.equal(validateVar({ name: 'x', value: '', options: [{ label: 'a', value: ' ' }] }), null)
  // options 为空数组 → 单值语义；单值空值仍拒绝
  assert.equal(validateVar({ name: 'x', value: '' }), null)
  assert.equal(validateVar({ name: 'x', value: '', options: [] }), null)
  assert.equal(validateVar({ name: 'x', value: 'v', options: [] }).options, undefined)
  assert.deepEqual(validateVar({ name: 'x', value: 'v' }), { name: 'x', value: 'v', updatedAt: '' })
})

test('isEnumVar / varOptions 判定与归一', () => {
  assert.equal(isEnumVar({ name: 'a', value: '', options: [{ label: 'l', value: 'v' }], updatedAt: '' }), true)
  assert.equal(isEnumVar({ name: 'a', value: 'v', updatedAt: '' }), false)
  assert.equal(isEnumVar({ name: 'a', value: 'v', options: [], updatedAt: '' }), false)
  assert.deepEqual(varOptions({ name: 'a', value: 'v', options: [{ label: '', value: 'v' }], updatedAt: '' }), [{ label: 'v', value: 'v' }])
  assert.deepEqual(varOptions({ name: 'a', value: 'v', updatedAt: '' }), [])
})

test('hasDirtyVars 把选项变化视为脏', () => {
  const base = [{ name: '环境信息', value: '', options: [{ label: '测试环境1', value: 't1' }], updatedAt: 't0' }]
  assert.equal(hasDirtyVars(base, [{ ...base[0], options: [{ ...base[0].options[0] }] }]), false)
  assert.equal(hasDirtyVars(base, [{ ...base[0], options: [{ label: '测试环境2', value: 't2' }] }]), true)
  assert.equal(hasDirtyVars(base, [{ ...base[0], value: 'x' }]), true)
})

test('buildVarEdit 携带并归一选项', () => {
  const built = buildVarEdit(
    { name: '环境信息', value: '', updatedAt: 't0' },
    { name: ' 环境信息 ', value: '', options: [{ label: ' 测试环境1 ', value: ' t1 ' }, { label: '', value: 't2' }] },
  )
  assert.equal(built.name, '环境信息')
  assert.deepEqual(built.options, [{ label: '测试环境1', value: 't1' }, { label: 't2', value: 't2' }])
  // 空选项数组 = 单值变量（不落空 options 字段）
  assert.equal(buildVarEdit({ name: '项目', value: 'a', updatedAt: '' }, { name: '项目', value: ' b ', options: [] }).options, undefined)
})

test('validateVarForm 校验表单（枚举需至少一个带值选项）', () => {
  assert.equal(validateVarForm({ name: '环境信息', value: '', options: [{ label: 'a', value: 't1' }] }), true)
  assert.equal(validateVarForm({ name: '环境信息', value: '', options: [{ label: 'a', value: '' }] }), false)
  assert.equal(validateVarForm({ name: '环境信息', value: '', options: [] }), false)
  assert.equal(validateVarForm({ name: '项目', value: 'iobs_pro', options: [] }), true)
  assert.equal(validateVarForm({ name: '', value: 'x', options: [] }), false)
})

test('变量管理器与填充面板暴露枚举控件', async () => {
  const source = await readFile(new URL('./ScenePicker.tsx', import.meta.url), 'utf8')
  // 管理器：枚举切换 + 选项编辑行
  assert.match(source, /枚举/)
  assert.match(source, /新增选项/)
  assert.match(source, /p-opt-row/)
  assert.match(source, /isEnumVar\(/)
  // 填充面板：枚举变量走下拉 + 自定义输入 + 必选提示
  assert.match(source, /EnumVarInput/)
  assert.match(source, /自定义/)
  assert.match(source, /必选/)
  assert.match(source, /role="combobox"/)
})

test('varPickGroups 级联第一级：先选变量（枚举变量标注可选值数量）', () => {
  const vars = [
    { name: '环境信息', value: '', options: [{ label: '测试环境1', value: 'https://t1.api' }, { label: '测试环境2', value: 'https://t2.api' }], updatedAt: '' },
    { name: '项目', value: 'iobs_pro', updatedAt: '' },
    { name: '空变量', value: '', updatedAt: '' },
  ]
  const all = varPickGroups(vars, '')
  assert.deepEqual(all.map((v) => v.name), ['环境信息', '项目'])
  // 第一级按变量名过滤
  assert.deepEqual(varPickGroups(vars, '项目').map((v) => v.name), ['项目'])
  // 在第一级直接搜枚举显示名/实际值 → 仍能定位到所属变量（省一步）
  assert.deepEqual(varPickGroups(vars, '测试环境2').map((v) => v.name), ['环境信息'])
  assert.deepEqual(varPickGroups(vars, 't1.api').map((v) => v.name), ['环境信息'])
  assert.deepEqual(varPickGroups(vars, '不存在的值'), [])
  assert.deepEqual(varPickGroups(null, ''), [])
})

test('varPickOptions 级联第二级：再选该变量的具体值', () => {
  const envVar = { name: '环境信息', value: '', options: [{ label: '测试环境1', value: 'https://t1.api' }, { label: '测试环境2', value: 'https://t2.api' }], updatedAt: '' }
  const single = { name: '项目', value: 'iobs_pro', updatedAt: '' }
  assert.deepEqual(varPickOptions(envVar, '').map((o) => o.label), ['测试环境1', '测试环境2'])
  // 第二级按显示名/实际值过滤
  assert.deepEqual(varPickOptions(envVar, '测试环境2').map((o) => o.value), ['https://t2.api'])
  assert.deepEqual(varPickOptions(envVar, 't1.api').map((o) => o.value), ['https://t1.api'])
  assert.deepEqual(varPickOptions(envVar, '不存在'), [])
  // 单值变量没有第二级
  assert.deepEqual(varPickOptions(single, ''), [])
})

test('填充面板实现级联选择（先变量后值）', async () => {
  const source = await readFile(new URL('./ScenePicker.tsx', import.meta.url), 'utf8')
  assert.match(source, /varPickGroups\(/)
  assert.match(source, /varPickOptions\(/)
  assert.match(source, /p-combo-head/)
  assert.match(source, /个可选值/)
  assert.doesNotMatch(source, /fillCandidates\(/)
})
