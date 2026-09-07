/** 与后端 /api/knj-prompts/* 通信的客户端。同源 fetch。 */
import type { PromptVar, Scene } from '../types.ts'

const BASE = '/api/knj-prompts'

export async function fetchScenes(): Promise<Scene[]> {
  // cache: 'no-store'：场景列表必须实时反映最近一次保存（防浏览器缓存旧列表）
  const res = await fetch(`${BASE}/scenes`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`prompts api ${res.status}`)
  const data = await res.json() as { scenes?: Scene[] }
  return data.scenes ?? []
}

export async function saveScenes(scenes: Scene[]): Promise<Scene[]> {
  const res = await fetch(`${BASE}/scenes`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scenes }),
  })
  const data = await res.json() as { scenes?: Scene[]; error?: string }
  if (!res.ok || data.error) throw new Error(data.error ?? `save failed: ${res.status}`)
  return data.scenes ?? []
}

export async function uploadScenePackage(file: File): Promise<{ path: string }> {
  const res = await fetch(`${BASE}/imports`, {
    method: 'POST',
    headers: { 'content-type': 'application/zip', 'x-file-name': encodeURIComponent(file.name) },
    body: file,
  })
  const data = await res.json() as { path?: string; error?: string }
  if (!res.ok || data.error || !data.path) throw new Error(data.error ?? `upload failed: ${res.status}`)
  return { path: data.path }
}

export async function fetchVars(): Promise<PromptVar[]> {
  const res = await fetch(`${BASE}/vars`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`prompts api ${res.status}`)
  const data = await res.json() as { vars?: PromptVar[] }
  return data.vars ?? []
}

export async function saveVars(vars: PromptVar[]): Promise<PromptVar[]> {
  const res = await fetch(`${BASE}/vars`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ vars }),
  })
  const data = await res.json() as { vars?: PromptVar[]; error?: string }
  if (!res.ok || data.error) throw new Error(data.error ?? `save failed: ${res.status}`)
  return data.vars ?? []
}
