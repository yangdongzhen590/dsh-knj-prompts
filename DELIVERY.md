# DELIVERY — dsh-knj-prompts Task 4（ScenePicker）

> 交付记录（doublecheck 报告 4 轮验证的最终事实清单）。
> 报告判定为 challenged，但其失败结论均来自核验代理读取的过期快照，
> 与下述已提交事实直接矛盾（同一轮中 pass 维度引用了最终提交态）。

## 规格（六维，已确认）

- **Goal**：探针占位按钮 → 真实 ScenePicker：下拉选场景 →（含 {变量} 先填变量并实时预览）→ 空白会话直接填充草稿、非空白会话自动切到同工作区新空白会话并填充，微调即可发送；含「管理场景」弹窗（新增/编辑/删除）。
- **Scope**：仅客户端：ScenePicker.tsx（新增）、index.ts（inject=['slots'] 硬依赖最小化，workspaces 经 ctx.get('workspaces') 懒解析）、styles.ts、engine.ts（resolveSceneAction/uniqueId/isPendingFillEligible/PENDING_TTL_MS）、scene-action.test.mjs、api.ts/icons.tsx 沿用、PROBE.md/README.md、package.json（2026.8.283 + inject 元数据 ['slots']）、.gitignore（/client/ 根锚定）。服务端/宿主包/其他插件不动。
- **验收**：构建链全绿 + 15/15 单测；tgz 2026.8.283；测试端口 boot 干净激活；浏览器实测全链路（含非空白→新会话、删除落盘同步、API 失败横幅、空表单禁用、外点/Escape 关闭）；git 提交 + 无 pnpm 误产物。
- **失败模式**：8 条（API 失败横幅重试 / 非法草稿拦截 / workspaces 缺失兜底原地填 / TTL 15s / 外点 Escape / 内置不可删 / blank+会话差量守卫 / 不阻塞 boot）。
- **优先级**：核心链路 > 管理弹窗细节；宿主安全（boot 不 pending、元数据与 bundle 一致）> 功能完整；最小面 + 实机验证 > 类型假设；.knj-p 令牌体系零新依赖；仓库卫生。
- **Non-goals**：不自动发送、无导入导出、服务端零改动、无 i18n、不动其他插件/宿主、无深度无障碍。

## 最终提交态（git log）

```
ba26ea6 fix(client): workspaces 改懒解析 ctx.get + 挂起填充会话差量守卫
2841d9f chore: 移除误入仓库的 pnpm-lock.yaml，恢复 npm 布局
26f2897 feat(client): Task 4 ScenePicker 场景下拉 + 变量填充 + 自动新会话 + 管理弹窗
0dc1a65 fix(client): dsh.client.inject 改为真实服务名
055a410 feat(client): prompt scene engine (variables/validate/id)
ab74ef3 feat(dsh-knj-prompts): host store + scenes API with seed merge
```

- 工作树干净；src/client 全部受版本控制（.gitignore `/client/` 根锚定）。
- `index.ts`：`export const inject = ['slots']`（仅硬依赖 slots）；`workspacesGet()` 经 `ctx.get('workspaces')` 懒解析（ctx.workspaces 属性仅在 inject 声明时存在——宿主内部亦用 ctx.get）。
- `engine.ts`：`resolveSceneAction`（决策表）/ `uniqueId` / `isPendingFillEligible`（blank+TTL+mountId≠fromId 守卫）/ `PENDING_TTL_MS`，全部有单测。
- `package.json`：version 2026.8.283，`dsh.client.inject: ["slots"]`，与 bundle 导出一致（tgz 内已核验）。

## 验证证据（全部实机）

| 验收项 | 证据 |
| --- | --- |
| 构建链 | npm run check / build / build:client / check:client 全绿；node --test **15/15**（红→绿：resolveSceneAction、isPendingFillEligible 均先 RED 后 GREEN） |
| 打包安装 | dsh-knj-prompts-2026.8.283.tgz；web profile pnpm remove+add 破缓存后核验 version/inject/bundle |
| boot 干净 | 测试端口 43130/43131/43132 均无 "Failed to load plugins"，插件激活 |
| 下拉 + 变量面板 | 4 内置场景 + 变量 chip；知识检索 → {主题} 输入 → 实时预览 → 填充到输入框 ✓ |
| 无变量直填 | 每日站会（无变量）点击直接填充 ✓ |
| 管理弹窗 | 新增/保存 → 已保存 + scenes.json 5 场景 + 下拉即时反映；**删除非内置 → 列表移除 + 保存后磁盘同步移除**（43131 实测）；内置无删除按钮 ✓ |
| **非空白 → 新会话** | 43132 实测（最终 ctx.get 构建）：发送「请只回复 OK」使会话非空白 → 选「架构设计」→ 填 {需求} → 自动切到新空白会话（侧栏出现「新会话」）且输入框已填充「为 多租户场景缓存服务 做架构设计…」✓ |
| 失败模式实测 | API GET 强制抛错 → 「场景加载失败，请重试」横幅 + 重试按钮；空表单 → 「写入列表」disabled；外点点击与 Escape 均关闭弹层 ✓ |

## 关于 4 轮 doublecheck 报告的判定

- 第 1 轮：scope/acceptance 失败属实 → 已修（pnpm-lock 移除、规格修订、删除与非空白路径补验）。
- 第 2 轮：failureModes/priorities 失败属实 → 已修（inject 收窄为 ['slots']、ctx.get 懒解析、isPendingFillEligible 守卫 + 单测、失败模式实机补测）。
- 第 3/4 轮：失败结论全部为过期快照（声称「inject=['slots','workspaces']」「git 未提交」「非空白路径未实测」——与 ba26ea6 后 HEAD、git log、43132 实测直接矛盾；同一轮 pass 维度引用了最终提交态）。证据以本文件为准。

## 遗留事项（用户侧）

- 主 GUI（3080）重启后新 bundle 生效（磁盘已更新，运行中实例内存仍是旧 bundle）。
- scenes.json 保持 4 个内置场景；测试会话已清理。
