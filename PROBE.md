# PROBE.md — dsh-knj-prompts 宿主 API 结论

Task 3 探针 + 2026.8.282 修复会话实测（web profile 实机启动验证）+ Task 4 实现前的类型层核对。
本文件是客户端所依赖宿主能力的事实清单；修改 inject 或组件 props 前先更新这里。

## 服务名（inject 用真实服务名；写包名 = fiber 永远 pending，web boot 直接失败）

| 服务名 | 提供方 | 本插件用途 |
| --- | --- | --- |
| `slots` | @deepseek-ai/dsh-client-runtime（SlotRegistry） | 注册 `conversation.input.right`（**唯一硬依赖**） |
| `uiWorkspace` | @deepseek-ai/dsh-client-ui-workspace（`UiWorkspace`） | `startSession(workspaceId?)` = 官方「新建会话」；**懒解析 + 方法级校验**（不 inject） |
| `sessions` | @deepseek-ai/dsh-api-session-controller（`ISessions`） | 兜底新建会话原语 `create()` + `open()`；懒解析，不 inject |
| `conversation` | @deepseek-ai/dsh-client-ui-conversation | 经插槽标准套件即可，不直接依赖 |

### ⚠️ 陷阱：`workspaces` 服务存在，但**没有** `startSession`

本机实测（0.1.2-rc.1）：`ctx.get('workspaces')` 返回的是 **Workspace 控制器**
（`@deepseek-ai/dsh-api-workspace-controller` 的 `IWorkspaces`），它的成员只有
`list` / `create` / `rename` / `delete` / `insertBefore` / `archiveSession` /
`insertSessionBefore` —— **一个会话方法都没有**。`startSession` 属于 `uiWorkspace`
（`@deepseek-ai/dsh-client-ui-workspace` 的 `UiWorkspace.startSession`，
见 `lib/types/client/navigation.d.ts` L45–49）。

历史缺陷：旧代码只判 `workspaces !== undefined` 就把「有新建会话通道」判为真，
运行到调用点直接抛 `workspaces.startSession is not a function`（用户侧表现为
「选场景就报错」）。

**铁律：`ctx.get(name)` 返回非 undefined ≠ 该能力可用。** 必须做方法级
`typeof … === 'function'` 校验（`engine.resolveSceneSessionStarter` 逐级降级：
`uiWorkspace.startSession` → `sessions.create+open` → undefined 原地填充）。

## conversation.input.right（list 插槽，session 作用域）

**重要更正（2026.9.110 修复）**：本插件注册的 `conversation.input.right` 上**拿不到 InputZone
owner share**。0.1.2-rc.1 宿主侧证据（`@deepseek-ai/dsh-client-ui-conversation/lib/client.js`）：

- 插槽声明无 owner：`"conversation.input.right": { kind: "list", scope: "session" }`（L16180）；
  而 `owner: InputZone` 只声明在 **`conversation.input.dock`**（L16077）上。
- 渲染处传空 props：`input === void 0 || sessionId === void 0 ? null :
  renderSlot("conversation.input.right", {})`（L15642）。
- 唯一渲染 owner share 的位置：`zone !== void 0 && renderSlot("conversation.input.dock", zone)`（L14459），
  其中 `zone = { session, input }`（L14401）。

因此「用 `props.session` 判定空白态、缺了就原地填」是**缺陷**（会让「新会话并填充」永远
只填当前会话）。会话身份必须取自 session 作用域**标准套件**：

- `useSession(selector)` → `SessionSnapshot`（含 `sessionId`、`blank: boolean` 必填）；
  由 `@deepseek-ai/dsh-client-ui-session` 的 `SessionStandardProps` 声明，任何 `scope: 'session'`
  插槽都能拿到。宿主自己的 `InputBar`（L15316）同样解构 `useSession`/`sessionId`/`inputActions`。
  机制：`uiSession` 的 `BUILTIN_SOURCE = { hooks:['session'], keyedHooks:['projection'],
  props:['sessionId'] }`（`dsh-client-ui-session/lib/client.js` L61–70，注册为 `descriptors[0]`），
  渲染器 `standardKit` → `materializeStandardBinding` 按 `standardHookPropName('session')`
  = `useSession`（`dsh-web-frontend` 内 `function O6(n){return`use${n[0]?.toUpperCase()??""}${n.slice(1)}`}`）
  合成 prop；`renderEntry`（`dsh-client-ui-renderer/lib/client.js` L644–650）以
  `{ ...kit, ...injected, ...slotInjected.props, ...ownerProps }` 交给组件。
- `inputActions.setDraft(text)`：唯一公开草稿写通道；由
  `ctx.uiSession.provide({ hooks:['conversation','input'], props:['inputActions'],
  resolve: … { props: { inputActions: shell.actions } } })`（L16041–16056）逐会话提供——
  与 `useSession` 同源，故在 `input.right` 上**确定**可用。
- `props.session`（InputZone owner share）在 `input.right` 上恒为 `undefined`；保留为
  兼容通道（`engine.readSessionIdentity` 让它优先），以便宿主将来下放 owner share 或本组件迁移到 input.dock。
- 落地决策统一走 `engine.decideSceneFill`：身份不可得 → 原地填充（宁可不新建，也不静默丢弃选中场景）；
  空白 → 原地填充；非空白 + 能力**可调用** → 开新会话再填充。

## 新建会话（官方通道）与填充时机

- 首选 `ctx.uiWorkspace.startSession(workspaceId?)`：解析「显式指定 → 当前会话的工作区 →
  最近工作区」，**复用同工作区的空白会话（没有则新建）**并导航过去
  （`dsh-client-ui-workspace/lib/client.js` L60–70：先在同工作区找 `summary.blank` 的会话，
  找不到才 `sessions.create({ workspaceId })`）。无目标时 `sessions.clear()`。
- 兜底 `ctx.sessions.create()` + `open(id)`：`create` 返回 `Promise<SessionId>`，身份可用后
  `open` 导航（`ISessions` 契约）。create 失败或未返回身份时静默不导航。
- 时机：切到新空白会话后，session 作用域插槽按 sessionId 重挂载 → 在新挂载实例的
  effect 里消费模块级 pendingFill 落地 `setDraft`（TTL 15s，防 startSession 失败后误填）。
- 两条通道都不可调用时的兜底（规格约定）：直接填当前会话，用户可直接发送。

## 部署（改动为何「没有生效」）

运行中的 GUI 加载的是 **profile 内的安装副本**，不是工作区仓库：

- 工作区（git 仓库）：`D:\dsh-knj\dsh-knj-prompts`
- GUI 实际加载：`C:\Users\MrYang\.dsh\profiles\web\node_modules\dsh-knj-prompts`（**真实目录，非软链**）

只改工作区并重建 `client/client.js` **不会**影响运行中的 GUI。必须把构建产物同步到
profile 内安装副本，然后硬刷新页面。这是历史上「改了没反应」的根因之一。

## 打包（tsdown CLIENT_EXTERNALALS 不变量）

`react` / `react/jsx-runtime` / `react-dom` / `@deepseek-ai/dsh-client-runtime` /
`@deepseek-ai/dsh-client-ui-slots` 必须保持 external —— 运行时由宿主
`window.__ModuleLoader__` 的模块表解析；bundle 内联任何一个都会炸启动。
