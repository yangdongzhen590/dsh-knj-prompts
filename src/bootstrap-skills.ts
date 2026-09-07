import { cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BOOTSTRAP_SKILL_IDS = ['scene-package-exporter', 'scene-package-installer'] as const

export interface BootstrapSkillsResult {
  installed: string[]
  skipped: string[]
}

/**
 * 安装随插件分发的场景包 skills。目标目录一旦存在即完全保留给用户，
 * 因此不会覆盖、合并或修补已有 skill。
 */
export function ensureBootstrapSkills(dshHome: string, sourceRoot: string): BootstrapSkillsResult {
  const targetRoot = join(dshHome, 'skills')
  const installed: string[] = []
  const skipped: string[] = []

  for (const skillId of BOOTSTRAP_SKILL_IDS) {
    const target = join(targetRoot, skillId)
    if (existsSync(target)) {
      skipped.push(skillId)
      continue
    }
    cpSync(join(sourceRoot, skillId), target, { recursive: true, errorOnExist: true })
    installed.push(skillId)
  }

  return { installed, skipped }
}
