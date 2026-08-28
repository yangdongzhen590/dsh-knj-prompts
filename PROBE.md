# PROBE.md — dsh-knj-prompts 宿主 API 结论

Task 3 探针 + 2026.8.282 修复会话实测（web profile 实机启动验证）+ Task 4 实现前的类型层核对。
本文件是客户端所依赖宿主能力的事实清单；修改 inject 或组件 props 前先更新这里。

## 服务名（inject 用真实服务名；写包名 = fiber 永远 pending，web boot 直接失败）

| 服务名 | 提供方 | 本插件用途 |
| --- | --- | --- |
| `slots` | @deepseek-ai/dsh-client-runtime（SlotRegistry） | 注册 `conversation.input.right` |
| `workspaces` | @deepseek-ai/dsh-client-runtime（IWorkspaces） | `startSession()` = 官方「新建会话」 |
| `sessions` | 同包（ISessions） | Task 4 不再直接依赖（经插槽标准套件即可） |
| `conversation` | @deepseek-ai/dsh-client-ui-conversation | Task 4 不再直接依赖 |

## conversation.input.right（list 插槽，session 作用域）

- owner share（InputZone）：`session: ConversationSnapshot`、`input: InputState`
  —— 两者都是快照式 props，随宿主 store 变化自动重渲染，不需要自己订阅。
- `ConversationSnapshot.blank`：空日志位（该会话还没被任何已接受的首条 prompt 消费；
  空白会话会被 New Session 复用）。
- session 作用域标准套件：`sessionId` / `useSession` / `useSessions` / `useInput` /
  `inputActions`；`inputActions.setDraft(text)` 是唯一公开草稿写通道。

## 新建会话（官方通道）与填充时机

- `ctx.workspaces.startSession(workspaceId?)`：连接「显式指定 → 当前会话的工作区 →
  最近工作区」的空白会话（没有则 host 新建）并导航过去；失败非致命。
- 时机：切到新空白会话后，session 作用域插槽按 sessionId 重挂载 → 在新挂载实例的
  effect 里消费模块级 pendingFill 落地 `setDraft`（TTL 15s，防 startSession 失败后误填）。
- workspaces 不可用时的兜底（规格约定）：直接填当前会话，用户可直接发送。

## 打包（tsdown CLIENT_EXTERNALALS 不变量）

`react` / `react/jsx-runtime` / `react-dom` / `@deepseek-ai/dsh-client-runtime` /
`@deepseek-ai/dsh-client-ui-slots` 必须保持 external —— 运行时由宿主
`window.__ModuleLoader__` 的模块表解析；bundle 内联任何一个都会炸启动。
