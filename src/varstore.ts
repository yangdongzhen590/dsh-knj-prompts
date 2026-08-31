// src/varstore.ts
// 变量库存储：<DSH_HOME|~/.dsh>/knj-prompts/vars.json。原子写、损坏重建。
// 条目 = {name, value, updatedAt}（环境变量 NAME=VALUE 语义）。
// 旧格式 {name, values: string[]} 在 load 时自动迁移为 value（取第一个非空值）并落盘。
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { PromptVar } from './types.ts'

/** 旧格式 values[] → value：取第一个非空字符串（trim 后），无则 null（条目作废）。 */
function migrateLegacy(raw: Record<string, unknown>): PromptVar | null {
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return null
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : ''
  if (typeof raw.value === 'string') {
    if (!raw.value.trim()) return null
    return { name, value: raw.value.trim(), updatedAt }
  }
  // 旧格式：values 数组 → 取第一个非空值
  if (Array.isArray(raw.values)) {
    const first = raw.values.find((x) => typeof x === 'string' && x.trim())
    if (first === undefined) return null
    return { name, value: String(first).trim(), updatedAt }
  }
  return null
}

export class VarStore {
  private vars: PromptVar[] = []

  constructor(private readonly file: string) {
    this.load()
  }

  private load(): void {
    if (!existsSync(this.file)) {
      this.vars = []
      return
    }
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as { version?: number; vars?: unknown[] }
      const entries = Array.isArray(raw.vars)
        ? (raw.vars
            .map((v) => (v && typeof v === 'object' ? migrateLegacy(v as Record<string, unknown>) : null))
            .filter((v): v is PromptVar => v !== null))
        : []
      // 去重（大小写不敏感，保留最后一个）
      const seen = new Map<string, PromptVar>()
      for (const v of entries) seen.set(v.name.toLowerCase(), v)
      this.vars = [...seen.values()]
      // 旧格式（含 values 字段）已迁移 → 落盘为新 schema
      const hadLegacy = Array.isArray(raw.vars)
        && raw.vars.some((v) => v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>).values))
      if (hadLegacy) this.persist()
    } catch {
      try { renameSync(this.file, this.file + '.bak') } catch { /* 备份失败不阻断 */ }
      this.vars = []
    }
  }

  list(): PromptVar[] {
    return this.vars.map((v) => ({ ...v }))
  }

  save(vars: PromptVar[]): void {
    const now = new Date().toISOString()
    // 内容感知 updatedAt：只有内容真正变化的条目才刷新时间戳。
    this.vars = vars.map((v) => {
      const prev = this.vars.find((p) => p.name.toLowerCase() === v.name.toLowerCase())
      const contentChanged = !prev
        || prev.name !== v.name
        || prev.value !== v.value
      return { ...v, updatedAt: contentChanged ? now : (v.updatedAt || now) }
    })
    this.persist()
  }

  /** 原子写（tmp + rename）：写一半崩溃只丢 tmp 文件，目标保持完整旧内容。 */
  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const json = JSON.stringify({ version: 1, vars: this.vars }, null, 2)
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
