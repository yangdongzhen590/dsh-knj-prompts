// src/types.ts
export interface Scene {
  id: string
  name: string
  description: string
  prompt: string
  builtin: boolean
  updatedAt: string
  /**
   * seed 基线文案（内置场景专用）：prompt === seedPrompt 表示用户从未编辑过，
   * 插件升级 seed 时可安全更新；不等则保留用户版本。旧格式文件无此字段，
   * 由 SceneStore 按 EPOCH updatedAt 迁移推断。
   */
  seedPrompt?: string
}

/** 场景 id 只允许 SAFE_ID 字符集（客户端与服务端共用）。 */
export const SAFE_ID = /^[a-zA-Z0-9\u4e00-\u9fff][a-zA-Z0-9\u4e00-\u9fff-]*$/

/**
 * 全局可复用变量（变量库/环境变量）：名称 → 单个值（NAME=VALUE 语义）。
 * name 为唯一键（大小写不敏感）；填充场景时下拉选择变量，取其 value 填入占位符。
 * 旧格式 values[] 由 VarStore.load 自动迁移为 value（取第一个非空值）。
 */
export interface PromptVar {
  name: string
  value: string
  updatedAt: string
}

/** 内置场景 seed（首版 4 个）。updatedAt 用 epoch 标记"未编辑"。 */
export const SEED_SCENES: Scene[] = [
  {
    id: 'knowledge-retrieval',
    name: '知识检索',
    description: '分层检索当前知识库并合成带引用的回答',
    prompt: '用 wiki_query 分层检索当前知识库：{主题}。请按标题/标签→正文→图谱邻居的顺序检索，基于候选页合成带引用的回答；无匹配时明确说明，并建议把相关内容吸收进 wiki。',
    builtin: true,
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'code-review',
    name: '代码审查',
    description: '按四维输出问题清单',
    prompt: '审查以下代码范围：{范围}。按 规格符合性 / 实现质量 / 边界与错误处理 / 安全 四个维度输出问题清单（严重/一般/建议，每条附证据）。',
    builtin: true,
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'architecture-design',
    name: '架构设计',
    description: '需求 → 方案权衡 → 模块划分',
    prompt: '为 {需求} 做架构设计：约束与上下文 → 2-3 个候选方案权衡 → 推荐方案 → 模块划分与接口 → 风险与验证方式。',
    builtin: true,
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'requirement-breakdown',
    name: '需求拆解',
    description: '模糊需求 → 可执行任务清单',
    prompt: '把以下需求拆成可执行任务清单：{需求}。按依赖顺序输出，每项含验收标准与失败模式，标注优先级。',
    builtin: true,
    updatedAt: new Date(0).toISOString(),
  },
]
