// src/store.ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
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
        ? raw.scenes.filter((s) => s && typeof s === 'object' && SAFE_ID.test(s.id) && typeof s.prompt === 'string')
        : []
    } catch {
      try { renameSync(this.file, this.file + '.bak') } catch { /* 备份失败不阻断 */ }
      this.scenes = []
    }
  }

  /** seed 合并：缺失的内置场景补入；用户编辑过（prompt 与 seed 不同）的内置场景不覆盖。 */
  ensureSeeded(): void {
    let changed = false
    for (const seed of SEED_SCENES) {
      const existing = this.scenes.find((s) => s.id === seed.id)
      if (!existing) {
        this.scenes.push({ ...seed })
        changed = true
      } else if (existing.builtin && existing.prompt !== seed.prompt && existing.updatedAt !== EPOCH) {
        // 用户编辑过：保留用户版本，不覆盖
      }
    }
    if (changed) this.persist()
  }

  list(): Scene[] {
    return this.scenes.map((s) => ({ ...s }))
  }

  get(id: string): Scene | undefined {
    return this.scenes.find((s) => s.id === id)
  }

  save(scenes: Scene[]): void {
    const now = new Date().toISOString()
    this.scenes = scenes.map((s) => ({ ...s, updatedAt: now }))
    this.persist()
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const json = JSON.stringify({ version: 1, scenes: this.scenes }, null, 2)
    // Node writeFileSync 默认 UTF-8 无 BOM
    writeFileSync(this.file, json, { encoding: 'utf8' })
  }
}
