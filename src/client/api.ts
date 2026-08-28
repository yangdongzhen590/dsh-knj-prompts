/** 与后端 /api/knj-prompts/* 通信的客户端。同源 fetch。 */
import type { Scene } from '../types.ts'

const BASE = '/api/knj-prompts'

export async function fetchScenes(): Promise<Scene[]> {
  const res = await fetch(`${BASE}/scenes`)
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
