// src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { SceneStore } from './store.ts'
import { mountPromptRoutes, type PromptHost } from './routes.ts'

export const name = 'dsh-knj-prompts'

export function apply(ctx: Context): void {
  ctx.inject(['webServer'], (hostCtx: Context) => {
    const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
    const store = new SceneStore(join(dshHome, 'knj-prompts', 'scenes.json'))
    const dispose = mountPromptRoutes(hostCtx as unknown as PromptHost, store)
    return () => dispose()
  })
}
