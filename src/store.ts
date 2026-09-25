// src/store.ts
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { SAFE_ID, SEED_SCENES, type Scene } from './types.ts'

const EPOCH = new Date(0).toISOString()

/** 场景配置存储：<DSH_HOME|~/.dsh>/knj-prompts/scenes.json。原子写、损坏重建、seed 合并。 */
export class SceneStore {
  private scenes: Scene[] = []

  constructor(private readonly file: string) {
    this.load()
    // 首次运行/缺场景时自动补 seed（有缺才写盘）
    this.ensureSeeded()
  }

  private load(): void {
    if (!existsSync(this.file)) {
      this.scenes = []
      return
    }
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as { version?: number; scenes?: Scene[] }
      this.scenes = Array.isArray(raw.scenes)
        ? raw.scenes
          .filter((s) => s && typeof s === 'object' && SAFE_ID.test(s.id) && typeof s.prompt === 'string')
          .map((s) => ({
            ...s,
            operationManual: typeof s.operationManual === 'string' ? s.operationManual : '',
            favorite: s.favorite === true,
          }))
        : []
    } catch {
      try { renameSync(this.file, this.file + '.bak') } catch { /* 备份失败不阻断 */ }
      this.scenes = []
    }
  }

  /**
   * seed 合并、升级与回收：
   * - 缺失的内置场景补入（带 seedPrompt 基线）；
   * - 用户未编辑过（prompt === seedPrompt）的内置场景随插件升级更新到新 seed；
   * - 用户编辑过（prompt !== seedPrompt）的内置场景不覆盖；
   * - 旧格式（无 seedPrompt 字段）按 EPOCH updatedAt 迁移：EPOCH = 从未经用户保存
   *   编辑，其 prompt 即旧版 seed；非 EPOCH 无基线时保守不动；
   * - 回收：不再出现在 SEED_SCENES 里的旧内置场景——用户未编辑过的直接移除
   *   （插件升级后内置列表只保留新 seed），编辑过的降级为普通场景（builtin=false、
   *   去掉 seed 基线），避免丢掉用户自己写的内容。
   */
  ensureSeeded(): void {
    let changed = false
    const seedIds = new Set(SEED_SCENES.map((s) => s.id))

    // ---- 回收：移除/降级不再属于 seed 的旧内置场景 ----
    const retired: Scene[] = []
    const kept: Scene[] = []
    for (const s of this.scenes) {
      if (!s.builtin || seedIds.has(s.id)) {
        kept.push(s)
        continue
      }
      // 是否被用户编辑过：有基线看 prompt 是否偏离；旧格式看 updatedAt 是否为 EPOCH
      const edited = s.seedPrompt !== undefined
        ? s.prompt !== s.seedPrompt
        : s.updatedAt !== EPOCH
      changed = true
      if (edited) {
        const { seedPrompt: _drop, ...rest } = s
        retired.push({ ...rest, builtin: false })
      }
    }
    if (retired.length) kept.push(...retired)
    if (changed) this.scenes = kept

    for (const seed of SEED_SCENES) {
      const existing = this.scenes.find((s) => s.id === seed.id)
      if (!existing) {
        this.scenes.push({ ...seed, seedPrompt: seed.prompt })
        changed = true
        continue
      }
      if (!existing.builtin) continue
      if (existing.seedPrompt === undefined) {
        if (existing.updatedAt !== EPOCH) continue // 旧格式且用户编辑过：无法确认基线，保守不动
        existing.seedPrompt = existing.prompt // EPOCH：prompt 即旧版 seed，迁移基线
        changed = true
      }
      if (existing.prompt === existing.seedPrompt && existing.prompt !== seed.prompt) {
        // 未编辑：升级到新 seed
        existing.prompt = seed.prompt
        existing.seedPrompt = seed.prompt
        changed = true
      }
    }
    if (changed) this.persist()
  }

  list(): Scene[] {
    return this.scenes.map((s) => ({ ...s }))
  }

  save(scenes: Scene[]): void {
    const now = new Date().toISOString()
    // 内容感知 updatedAt：只有内容真正变化的条目才刷新时间戳。
    // 旧行为全量刷新会让「未编辑」判定（EPOCH / seedPrompt 配对）永远失效，
    // seed 升级永远进不来。
    this.scenes = scenes.map((s) => {
      const prev = this.scenes.find((p) => p.id === s.id)
      const contentChanged = !prev
        || prev.name !== s.name
        || prev.description !== s.description
        || prev.prompt !== s.prompt
        || prev.operationManual !== s.operationManual
        || prev.builtin !== s.builtin
        || prev.favorite !== s.favorite
      return { ...s, updatedAt: contentChanged ? now : (s.updatedAt || now) }
    })
    this.persist()
  }

  /** 原子写（tmp + rename）：写一半崩溃只丢 tmp 文件，目标保持完整旧内容；
   *  Windows rename 被占用时回退直接写。Node writeFileSync 默认 UTF-8 无 BOM。 */
  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const json = JSON.stringify({ version: 1, scenes: this.scenes }, null, 2)
    const tmp = this.file + '.tmp-' + Date.now().toString(36)
    writeFileSync(tmp, json, 'utf8')
    try {
      renameSync(tmp, this.file)
    } catch {
      try { rmSync(tmp, { force: true }) } catch { /* best effort */ }
      writeFileSync(this.file, json, { encoding: 'utf8' })
    }
  }
}
