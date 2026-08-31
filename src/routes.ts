// src/routes.ts
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SceneStore } from './store.ts'
import type { VarStore } from './varstore.ts'
import { hasDuplicateVarNames, validateScene, validateVar } from './client/engine.ts'
import type { PromptVar, Scene } from './types.ts'

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

/** 请求体超限：路由层据此回 413（区别于 400 的 JSON 语法错误）。 */
class BodyTooLargeError extends Error {
  constructor() { super('body too large') }
}

function sendJson(response: ServerResponse, status: number, data: unknown): void {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  // 数据接口永不缓存：场景/变量列表必须实时反映最近一次保存
  response.setHeader('Cache-Control', 'no-store')
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

/** 读取请求体（拼接 data/end，超限 413）。
 *  超限时不 destroy 连接：destroy 会让已经准备好的 413 响应永远送不到客户端
 *  （客户端只看到连接重置/挂死）。改为 resume 丢弃剩余数据，让响应正常写出。 */
function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new BodyTooLargeError())
        request.resume() // 丢弃剩余数据，让流正常走到 end（reject 后 resolve 无效）
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
          // P1：入库前逐条校验。旧行为 `Array.isArray(body.scenes) ? scenes : []`
          // 会把非数组静默存成 []（清空全部场景），非法条目直接落库。
          if (!Array.isArray(body.scenes)) {
            return sendJson(response, 400, { error: 'scenes must be an array' })
          }
          const validated = (body.scenes as unknown[]).map(validateScene)
          if (validated.some((v) => v === null)) {
            return sendJson(response, 400, { error: 'invalid scenes: every scene needs valid id/name/prompt' })
          }
          store.save(validated as Scene[])
          return sendJson(response, 200, { scenes: store.list() })
        } catch (e) {
          if (e instanceof BodyTooLargeError) return sendJson(response, 413, { error: 'body too large' })
          return sendJson(response, 400, { error: 'invalid json body' })
        }
      }
      return sendJson(response, 405, { error: 'method not allowed' })
    },
  })
  return () => { dispose() }
}

/** 挂载变量库读写端点（GET/PUT /api/knj-prompts/vars）。返回 disposer。 */
export function mountVarRoutes(host: PromptHost, varStore: VarStore): () => void {
  const dispose = host.webServer.register({
    kind: 'exact',
    path: `${BASE}/vars`,
    handler: async (request, response) => {
      if (request.method === 'GET') {
        return sendJson(response, 200, { vars: varStore.list() })
      }
      if (request.method === 'PUT') {
        if (!isSameOrigin(request)) return sendJson(response, 403, { error: 'cross-origin forbidden' })
        const contentType = (request.headers['content-type'] ?? '').split(';')[0].trim()
        if (contentType !== 'application/json') return sendJson(response, 415, { error: 'json only' })
        try {
          const body = await readJsonBody(request)
          if (!Array.isArray(body.vars)) {
            return sendJson(response, 400, { error: 'vars must be an array' })
          }
          const validated = (body.vars as unknown[]).map(validateVar)
          if (validated.some((v) => v === null)) {
            return sendJson(response, 400, { error: 'invalid vars: every var needs a name and at least one non-empty value' })
          }
          if (hasDuplicateVarNames(validated as PromptVar[])) {
            return sendJson(response, 400, { error: 'duplicate var names (case-insensitive)' })
          }
          varStore.save(validated as PromptVar[])
          return sendJson(response, 200, { vars: varStore.list() })
        } catch (e) {
          if (e instanceof BodyTooLargeError) return sendJson(response, 413, { error: 'body too large' })
          return sendJson(response, 400, { error: 'invalid json body' })
        }
      }
      return sendJson(response, 405, { error: 'method not allowed' })
    },
  })
  return () => { dispose() }
}
