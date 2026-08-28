// routes.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { SceneStore } = require('../lib/store.js')
const { mountPromptRoutes } = require('../lib/routes.js')

function startServer() {
  const dir = mkdtempSync(join(tmpdir(), 'knj-prompts-routes-'))
  const store = new SceneStore(join(dir, 'scenes.json'))
  const routes = []
  const fakeHost = {
    webServer: { register(route) { routes.push(route); return () => {} } },
  }
  const dispose = mountPromptRoutes(fakeHost, store)
  const server = createServer((req, res) => {
    const route = routes.find((r) => r.kind === 'exact' && r.path === req.url.split('?')[0])
    if (route) return void route.handler(req, res)
    res.writeHead(404); res.end('{}')
  })
  return { server, store, dir, dispose }
}

function request(port, method, path, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = require('node:http').request({ host: '127.0.0.1', port, method, path, headers: { connection: 'close', ...headers } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

test('GET /api/knj-prompts/scenes 返回 seed 场景', async () => {
  const s = startServer()
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r))
  const port = s.server.address().port
  const res = await request(port, 'GET', '/api/knj-prompts/scenes')
  const data = JSON.parse(res.body)
  assert.equal(res.status, 200)
  assert.equal(data.scenes.length, 4)
  s.server.close(); s.dispose(); rmSync(s.dir, { recursive: true, force: true })
})

test('PUT 无同源头 → 403', async () => {
  const s = startServer()
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r))
  const port = s.server.address().port
  const res = await request(port, 'PUT', '/api/knj-prompts/scenes', {}, JSON.stringify({ scenes: [] }))
  assert.equal(res.status, 403)
  s.server.close(); s.dispose(); rmSync(s.dir, { recursive: true, force: true })
})

test('PUT 非 JSON content-type → 415', async () => {
  const s = startServer()
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r))
  const port = s.server.address().port
  const res = await request(port, 'PUT', '/api/knj-prompts/scenes', { origin: `http://127.0.0.1:${port}`, 'content-type': 'text/plain' }, 'scenes=[]')
  assert.equal(res.status, 415)
  s.server.close(); s.dispose(); rmSync(s.dir, { recursive: true, force: true })
})

test('PUT 同源 + JSON 保存成功', async () => {
  const s = startServer()
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r))
  const port = s.server.address().port
  const payload = { scenes: [{ id: 'custom', name: '自定义', description: '', prompt: '做 {事}', builtin: false, updatedAt: '' }] }
  const res = await request(port, 'PUT', '/api/knj-prompts/scenes', { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' }, JSON.stringify(payload))
  const data = JSON.parse(res.body)
  assert.equal(res.status, 200)
  assert.equal(data.scenes.length, 1)
  assert.equal(data.scenes[0].id, 'custom')
  s.server.close(); s.dispose(); rmSync(s.dir, { recursive: true, force: true })
})
