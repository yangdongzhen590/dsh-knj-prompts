// src/routes.ts
import { rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SceneStore } from './store.ts'
import type { VarStore } from './varstore.ts'
import { hasDuplicateVarNames, validateScene, validateVar } from './client/engine.ts'
import type { PromptVar, Scene } from './types.ts'
import { packageUploadError, stageScenePackage } from './scene-package.ts'

export interface WebServerService {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  }): () => void
}

export interface PromptHost { webServer: WebServerService }

const BASE = '/api/knj-prompts'
/** JSON 写请求体上限：1MB。 */
const MAX_BODY = 1024 * 1024

class BodyTooLargeError extends Error { constructor() { super('body too large') } }

function sendJson(response: ServerResponse, status: number, data: unknown): void {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.writeHead(status)
  response.end(JSON.stringify(data))
}

/** 写面安全：Origin 优先，缺失时 Referer；两者皆缺拒绝。 */
function isSameOrigin(request: IncomingMessage): boolean {
  const host = String(request.headers.host ?? '')
  if (!host) return false
  for (const header of ['origin', 'referer']) {
    const value = String(request.headers[header] ?? '')
    if (!value) continue
    try {
      const url = new URL(value)
      // dsh web 当前仅以 http 本地 GUI 提供本路由；拒绝跨协议请求。
      return url.protocol === 'http:' && url.host === host
    } catch { return false }
  }
  return false
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new BodyTooLargeError())
        request.resume()
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
  } catch { throw new Error('invalid json body') }
}

/** 挂载场景读写端点（seed 合并在 SceneStore 构造时已保证）。 */
export function mountPromptRoutes(host: PromptHost, store: SceneStore): () => void {
  const dispose = host.webServer.register({
    kind: 'exact', path: `${BASE}/scenes`, handler: async (request, response) => {
      if (request.method === 'GET') return sendJson(response, 200, { scenes: store.list() })
      if (request.method !== 'PUT') return sendJson(response, 405, { error: 'method not allowed' })
      if (!isSameOrigin(request)) return sendJson(response, 403, { error: 'cross-origin forbidden' })
      const contentType = (request.headers['content-type'] ?? '').split(';')[0].trim()
      if (contentType !== 'application/json') return sendJson(response, 415, { error: 'json only' })
      try {
        const body = await readJsonBody(request)
        if (!Array.isArray(body.scenes)) return sendJson(response, 400, { error: 'scenes must be an array' })
        const validated = (body.scenes as unknown[]).map(validateScene)
        if (validated.some((scene) => scene === null)) return sendJson(response, 400, { error: 'invalid scenes: every scene needs valid id/name/prompt' })
        store.save(validated as Scene[])
        return sendJson(response, 200, { scenes: store.list() })
      } catch (error) {
        if (error instanceof BodyTooLargeError) return sendJson(response, 413, { error: 'body too large' })
        return sendJson(response, 400, { error: 'invalid json body' })
      }
    },
  })
  return () => dispose()
}

/** 挂载变量库读写端点（GET/PUT /api/knj-prompts/vars）。 */
export function mountVarRoutes(host: PromptHost, varStore: VarStore): () => void {
  const dispose = host.webServer.register({
    kind: 'exact', path: `${BASE}/vars`, handler: async (request, response) => {
      if (request.method === 'GET') return sendJson(response, 200, { vars: varStore.list() })
      if (request.method !== 'PUT') return sendJson(response, 405, { error: 'method not allowed' })
      if (!isSameOrigin(request)) return sendJson(response, 403, { error: 'cross-origin forbidden' })
      const contentType = (request.headers['content-type'] ?? '').split(';')[0].trim()
      if (contentType !== 'application/json') return sendJson(response, 415, { error: 'json only' })
      try {
        const body = await readJsonBody(request)
        if (!Array.isArray(body.vars)) return sendJson(response, 400, { error: 'vars must be an array' })
        const validated = (body.vars as unknown[]).map(validateVar)
        if (validated.some((variable) => variable === null)) return sendJson(response, 400, { error: 'invalid vars: every var needs a name and at least one non-empty value' })
        if (hasDuplicateVarNames(validated as PromptVar[])) return sendJson(response, 400, { error: 'duplicate var names (case-insensitive)' })
        varStore.save(validated as PromptVar[])
        return sendJson(response, 200, { vars: varStore.list() })
      } catch (error) {
        if (error instanceof BodyTooLargeError) return sendJson(response, 413, { error: 'body too large' })
        return sendJson(response, 400, { error: 'invalid json body' })
      }
    },
  })
  return () => dispose()
}

/** ZIP 仅暂存，绝不由插件解压或安装；真实路径交给安装场景中的 AI skill。 */
export function mountPackageRoutes(host: PromptHost, importsDir: string): () => void {
  let disposed = false
  const activeRequests = new Set<IncomingMessage>()
  const dispose = host.webServer.register({
    kind: 'exact', path: `${BASE}/imports`, handler: async (request, response) => {
      if (request.method !== 'POST') return sendJson(response, 405, { error: 'method not allowed' })
      if (disposed) return sendJson(response, 503, { error: 'plugin unloading' })
      if (!isSameOrigin(request)) return sendJson(response, 403, { error: 'cross-origin forbidden' })
      const contentType = (request.headers['content-type'] ?? '').split(';')[0].trim()
      if (!['application/zip', 'application/x-zip-compressed'].includes(contentType)) return sendJson(response, 415, { error: 'zip content only' })
      const rawFilename = String(request.headers['x-file-name'] ?? '')
      let filename: string
      try { filename = decodeURIComponent(rawFilename) } catch { return sendJson(response, 400, { error: 'invalid file name' }) }
      const initialError = packageUploadError(filename, Number(request.headers['content-length'] ?? 0))
      if (initialError) return sendJson(response, initialError === 'package too large' ? 413 : 415, { error: initialError })
      activeRequests.add(request)
      try {
        const path = await stageScenePackage(request, importsDir, filename)
        if (disposed) {
          rmSync(path, { force: true })
          return sendJson(response, 503, { error: 'plugin unloading' })
        }
        return sendJson(response, 201, { path })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'package upload failed'
        return sendJson(response, message === 'package too large' ? 413 : 400, { error: message })
      } finally {
        activeRequests.delete(request)
      }
    },
  })
  return () => {
    disposed = true
    for (const request of activeRequests) request.destroy()
    dispose()
  }
}
