# dsh-knj-prompts

DSH 提示词场景插件：输入框右侧「✦ 提示词」下拉选场景 →（含 `{变量}` 时先填变量并实时预览）→
空白会话直接填充草稿、非空白会话自动切到同工作区新会话再填充，微调即可发送。

## 功能

- 输入框工具行右侧 ✦ 提示词 按钮，下拉列出全部场景（内置场景带「内置」标记，变量以 chip 展示）
- 场景提示词含 `{变量}` 时先弹填充面板：逐变量输入 + 实时预览，确认后填充
- 当前会话为空白会话 → 原地填充草稿；已有对话 → 自动开新会话（官方 New Session 通道）后填充
- 「管理场景…」弹窗：新增 / 编辑 / 删除场景（内置场景可编辑、不可删除），「保存全部」落盘
- 场景存储：`<DSH_HOME>/knj-prompts/scenes.json`（原子写、损坏自动备份重建、内置 seed 合并）

## 安装（web profile）

```powershell
# 在插件目录
npm run check && npm run build && npm run build:client && npm pack
# 在 web profile 的 package.json 里把依赖指向新 tgz 后重装
```

## 开发

- 纯函数与决策表：`src/client/engine.ts`（`node --test` 直接跑 .mjs 测试）
- 服务端（场景存储 + `/api/knj-prompts/scenes` GET/PUT）：`src/{store,routes}.ts`
- 客户端（ScenePicker 下拉 / 变量面板 / 管理弹窗）：`src/client/ScenePicker.tsx`
- 宿主 API 事实清单：[PROBE.md](./PROBE.md)（改 inject 或 props 前必读）
