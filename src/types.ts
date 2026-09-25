// src/types.ts
export interface Scene {
  id: string
  name: string
  description: string
  prompt: string
  /** 场景包操作说明：自由 Markdown；旧场景缺失时迁移为空字符串。 */
  operationManual: string
  builtin: boolean
  /** 是否收藏；旧 JSON 记录由 SceneStore/validateScene 迁移为 false。 */
  favorite: boolean
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
 * 全局可复用变量（变量库/环境变量）：名称 → 值。
 * - 单值变量（主流形式）：NAME=VALUE 语义，name 为唯一键（大小写不敏感）；
 * - 枚举变量：options 非空，每项含显示名 label 与实际插入值 value，填充时下拉选择。
 * 旧格式 values[] 由 VarStore.load 自动迁移为 value（取第一个非空值）。
 */
export interface PromptVar {
  name: string
  value: string
  /** 枚举候选（顺序即展示顺序）；缺省或空数组 = 单值变量。枚举变量的 value 可为空。 */
  options?: VarOption[]
  updatedAt: string
}

/** 枚举变量候选项：label 显示名（可空，回退为 value）、value 实际插入值（必填）。 */
export interface VarOption {
  label: string
  value: string
}

/**
 * 归一枚举候选：丢弃非对象条目与空 value 项，空 label 回退为 value。
 * 加载、校验、保存共用同一套规则，避免各处对「合法选项」判断不一致。
 */
export function normalizeVarOptions(raw: unknown): VarOption[] {
  if (!Array.isArray(raw)) return []
  const out: VarOption[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const value = typeof rec.value === 'string' ? rec.value.trim() : ''
    if (!value) continue
    const label = typeof rec.label === 'string' && rec.label.trim() ? rec.label.trim() : value
    out.push({ label, value })
  }
  return out
}

/**
 * 内置场景 seed。
 *
 * 只保留「导出场景包」「安装场景包」两个——它们是插件自身工作流的一部分（场景包的
 * 导出/安装需要 AI 引导），随插件一起交付；其余通用提示词场景不再内置，用户可按需自建。
 * updatedAt 用 epoch 标记"未编辑"。
 *
 * 注意：从 seed 列表移除的旧内置场景由 SceneStore.ensureSeeded 回收——
 * 用户未编辑过的直接移除，编辑过的降级为普通场景（不丢用户内容）。
 */
export const SEED_SCENES: Scene[] = [
  {
    id: 'export-scene-package',
    name: '导出场景包',
    description: '将一个普通场景及其 skills、素材打包为可迁移 ZIP',
    prompt: '请调用 scene-package-exporter skill，导出一个普通场景为单场景 .dshscene.zip。先询问我要导出的场景；读取其提示词和场景包说明；依说明收集要嵌入的 skills、素材与配置模板；展示 ZIP 文件树和会排除的源环境运行配置；我确认后才生成 ZIP。旧 skill 缺迁移说明时，请先生成草案供我确认。',
    operationManual: '使用 `scene-package-exporter`：一个 ZIP 只导出一个普通场景；操作说明是依赖、素材和配置迁移说明的唯一真源。导出前必须展示计划并获得确认；不要复制源机器的运行配置值。',
    builtin: true,
    favorite: false,
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'install-scene-package',
    name: '安装场景包',
    description: '从 ZIP 读取场景说明，AI 引导安装 skills、配置并验证',
    prompt: '请调用 scene-package-installer skill 安装场景包。场景包 ZIP 路径：{场景包ZIP路径}。先读取 ZIP、manifest、scene 和操作说明，展示预检结果；询问我要使用的 DSH skills 根目录及当前环境所需配置；若任一嵌入 skill 与目标已有同名目录，立即整体阻断且不写入任何文件；我确认后才安装、写入各 skill 自己定义的配置文件，并验证结果。',
    operationManual: '选择 ZIP 后插件会上传到本机暂存目录并填入真实路径。使用 `scene-package-installer` 读取该路径；不要把 ZIP 解压、安装或运行配置写入放在插件中完成。',
    builtin: true,
    favorite: false,
    updatedAt: new Date(0).toISOString(),
  },
]
