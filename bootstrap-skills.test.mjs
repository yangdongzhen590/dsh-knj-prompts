import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ensureBootstrapSkills } from './src/bootstrap-skills.ts'

const sourceRoot = join(import.meta.dirname, 'skills')

test('ensureBootstrapSkills copies only missing package skills', () => {
  const root = mkdtempSync(join(tmpdir(), 'knj-prompts-skills-'))
  try {
    const existing = join(root, 'skills', 'scene-package-exporter', 'SKILL.md')
    mkdirSync(join(root, 'skills', 'scene-package-exporter'), { recursive: true })
    writeFileSync(existing, 'user-owned exporter', 'utf8')

    const result = ensureBootstrapSkills(root, sourceRoot)

    assert.deepEqual(result.installed, ['scene-package-installer'])
    assert.deepEqual(result.skipped, ['scene-package-exporter'])
    assert.equal(readFileSync(existing, 'utf8'), 'user-owned exporter')
    assert.equal(existsSync(join(root, 'skills', 'scene-package-installer', 'SKILL.md')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
