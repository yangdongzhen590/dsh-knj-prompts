# PROBE.md — dsh-knj-prompts 宿主 API 结论

Task 3 探针 + 2026.8.282 修复会话实测（web profile 实机启动验证）+ Task 4 实现前的类型层核对。
**2026.10.151 按 dsh 0.2.1-rc.2 全量复核**（宿主 `.d.ts`/`.js` 源码 + 运行中 3080 实例的 HTTP 实测）。
本文件是客户端所依赖宿主能力的事实清单；修改 inject 或组件 props 前先更新这里。

## 服务名（inject 用真实服务名；写包名 = fiber 永远 pending，web boot 直接失败）

| 服务名 | 提供方 | 本插件用途 |
| --- | --- | --- |
| `slots` | @deepseek-ai/dsh-client-ui-slots（SlotRegistry；0.2.1 起并进 `dsh-web-frontend` 静态模块表，不再是独立 npm 包） | 注册 `conversation.input.right`（**唯一硬依赖**） |
| `uiWorkspace` | @deepseek-ai/dsh-client-ui-workspace（`UiWorkspace`） | `startSession(workspaceId?, { prompt, clearPreviousDraft })` = 官方「新建会话 + 原生草稿注入」；**懒解析 + 方法级校验**（不 inject） |
| `sessions` | @deepseek-ai/dsh-api-session-controller（`ISessions`） | **已不是新建会话通道**：0.2.1-rc.2 起 `ISessions` 无 `open`（导航归 `uiWorkspace.openSession`）。本插件原来的 `create()+open()` 兜底已删除 |
| `conversation` | @deepseek-ai/dsh-client-ui-conversation | 经插槽标准套件即可，不直接依赖 |

### ⚠️ 陷阱：`workspaces` 服务存在，但**没有** `startSession`

本机实测（0.1.2-rc.1 首次发现，**0.2.1-rc.2 复核仍成立**）：`ctx.get('workspaces')` 返回的是 **Workspace 控制器**
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

## 新建会话（官方通道）与草稿注入

- 唯一通道 `ctx.uiWorkspace.startSession(workspaceId?, options?)`：解析「显式指定 →
  当前会话的工作区 → 最近工作区」，**复用同工作区的空白会话（没有则新建）**并导航
  （`dsh-client-ui-workspace/lib/client.js`：先在同工作区找 `blank` 会话，找不到才
  `sessions.create({ workspaceId })`）。
- **0.2.1-rc.2 起 options 支持 `{ prompt, clearPreviousDraft, agentPreset }`**
  （`navigation.d.ts`：`StartSessionOptions extends DraftInitializationOptions`）。
  `startSession` 把草稿交给 `openWorkspace` 的 `beforeOpen`，后者在**导航发布之前**
  调 `conversation.input.requestDraftInitialization(binding, options)`，按**会话身份**
  写入目标会话编辑器。返回值 `'applied' | 'preserved' | 'blocked'`：
  - `preserved` = 保留目标会话已有文本、静默丢弃本次草稿 → 要覆盖必须显式
    `clearPreviousDraft: true`（本插件即如此，与旧 `setDraft` 无条件替换一致）；
  - `blocked` = 有提交在进行/会话正在销毁，宿主弹 `draft.initializationFailed`
    并中止导航；插件不重复提示、也不改填当前会话。
- 注入发生在**导航之前**，所以不需要「先跳转、再等新会话挂载补填」的跨挂载通道：
  2026.10.150 的 pendingFill + TTL 15s + 到达窗口 5s 已在 2026.10.151 删除。
- `sessions.create() + open()` 兜底已删除：0.2.1-rc.2 的 `ISessions` 不再暴露 `open`，
  那段代码永远不命中，只是假安全网。
- 通道不可调用时的兜底（规格约定）：直接填当前会话，用户可直接发送。

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

**0.2.1-rc.2 实测的模块表**：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、
`@deepseek-ai/cordis`、`zod`、`@tanstack/react-virtual`、`@deepseek-ai/dsh-client-store` /
`-ui-slots` / `-ui-primitives` / `-ui-dockkit`。**`@deepseek-ai/dsh-client-runtime` 已不存在**
（并进 `dsh-web-frontend`）。本插件的产物只 `require` `react` 与 `react/jsx-runtime`，
所以不受影响；哪天真去 `require` 一个不在表里的模块，启动会直接炸。

devDependencies 里的 `@deepseek-ai/dsh-client-runtime` / `@deepseek-ai/dsh-client-ui-slots`
（`^0.1.0-rc.8`）只是类型基线，**不对应宿主实际版本**；产物不 require 它们，故不影响运行。
