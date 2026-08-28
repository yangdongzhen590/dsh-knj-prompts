// src/routes.ts
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SceneStore } from './store.ts'

export interface WebServerService {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  }): () => void
}

export interface PromptHost {
  webServer: WebServerService
}

const BASE = '/api/knj-prompts'
/** 写请求体上限：1MB。 */
const MAX_BODY = 1024 * 1024

function sendJson(response: ServerResponse, status: number, data: unknown): void {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.writeHead(status)
  response.end(JSON.stringify(data))
}

/** 写面安全：同源校验（Origin 优先，缺失时 Referer），两者皆缺拒绝。 */
function isSameOrigin(request: IncomingMessage): boolean {
  const host = String(request.headers.host ?? '')
  if (!host) return false
  for (const header of ['origin', 'referer']) {
    const value = String(request.headers[header] ?? '')
    if (!value) continue
    try {
      return new URL(value).host === host
    } catch {
      return false
    }
  }
  return false
}

/** 读取请求体（拼接 data/end，超限 413）。 */
function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('body too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const bodyText = await readBody(request)
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    throw new Error('invalid json body')
  }
}

/** 挂载场景读写端点（seed 合并在 SceneStore 构造时已保证）。返回 disposer。 */
export function mountPromptRoutes(host: PromptHost, store: SceneStore): () => void {
  const dispose = host.webServer.register({
    kind: 'exact',
    path: `${BASE}/scenes`,
    handler: async (request, response) => {
      if (request.method === 'GET') {
        return sendJson(response, 200, { scenes: store.list() })
      }
      if (request.method === 'PUT') {
        if (!isSameOrigin(request)) return sendJson(response, 403, { error: 'cross-origin forbidden' })
        const contentType = (request.headers['content-type'] ?? '').split(';')[0].trim()
        if (contentType !== 'application/json') return sendJson(response, 415, { error: 'json only' })
        try {
          const body = await readJsonBody(request)
          const scenes = Array.isArray(body.scenes) ? (body.scenes as never[]) : []
          store.save(scenes as never)
          return sendJson(response, 200, { scenes: store.list() })
        } catch {
          return sendJson(response, 400, { error: 'invalid json body' })
        }
      }
      return sendJson(response, 405, { error: 'method not allowed' })
    },
  })
  return () => { dispose() }
}
