// src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { SceneStore } from './store.ts'
import { VarStore } from './varstore.ts'
import { mountPromptRoutes, mountVarRoutes, type PromptHost } from './routes.ts'

export const name = 'dsh-knj-prompts'

export function apply(ctx: Context): void {
  ctx.inject(['webServer'], (hostCtx: Context) => {
    const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
    const knjHome = join(dshHome, 'knj-prompts')
    const store = new SceneStore(join(knjHome, 'scenes.json'))
    const varStore = new VarStore(join(knjHome, 'vars.json'))
    const host = hostCtx as unknown as PromptHost
    const disposeScenes = mountPromptRoutes(host, store)
    const disposeVars = mountVarRoutes(host, varStore)
    return () => { disposeScenes(); disposeVars() }
  })
}
