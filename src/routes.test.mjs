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
const { VarStore } = require('../lib/varstore.js')
const { mountPromptRoutes, mountVarRoutes } = require('../lib/routes.js')

function startServer() {
  const dir = mkdtempSync(join(tmpdir(), 'knj-prompts-routes-'))
  const store = new SceneStore(join(dir, 'scenes.json'))
  const varStore = new VarStore(join(dir, 'vars.json'))
  const routes = []
  const fakeHost = {
    webServer: { register(route) { routes.push(route); return () => {} } },
  }
  const disposeScenes = mountPromptRoutes(fakeHost, store)
  const disposeVars = mountVarRoutes(fakeHost, varStore)
  const server = createServer((req, res) => {
    const route = routes.find((r) => r.kind === 'exact' && r.path === req.url.split('?')[0])
    if (route) return void route.handler(req, res)
    res.writeHead(404); res.end('{}')
  })
  return { server, store, varStore, dir, dispose: () => { disposeScenes(); disposeVars() } }
}

function request(port, method, path, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = require('node:http').request({ host: '127.0.0.1', port, method, path, headers: { connection: 'close', ...headers } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    // 兜底：服务端中途 destroy 连接（旧 bug）时不得无限挂起测试进程
    req.setTimeout(5000, () => req.destroy(new Error('client timeout: server hung up mid-upload')))
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

test('GET 响应带 Cache-Control: no-store（防浏览器缓存旧场景列表）', async () => {
  const s = startServer()
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r))
  const port = s.server.address().port
  const res = await request(port, 'GET', '/api/knj-prompts/scenes')
  assert.equal(res.status, 200)
  assert.equal(res.headers['cache-control'], 'no-store')
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

test('PUT 条目缺 name/prompt（validateScene 不过）→ 400，库存数据不变', async (t) => {
  const s = startServer()
  t.after(() => { s.server.close(); s.dispose(); rmSync(s.dir, { recursive: true, force: true }) })
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r))
  const port = s.server.address().port
  const before = JSON.stringify(s.store.list())
  const payload = { scenes: [{ id: 'bad', name: '', description: '', prompt: '', builtin: false, updatedAt: '' }] }
  const res = await request(port, 'PUT', '/api/knj-prompts/scenes', { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' }, JSON.stringify(payload))
  assert.equal(res.status, 400, '非法条目必须 400 拒绝')
  assert.equal(JSON.stringify(s.store.list()), before, '库不得被部分/非法数据污染')
})

test('PUT scenes 非数组 → 400（旧行为：静默存 [] 清空全部场景）', async (t) => {
  const s = startServer()
  t.after(() => { s.server.close(); s.dispose(); rmSync(s.dir, { recursive: true, force: true }) })
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r))
  const port = s.server.address().port
  const before = JSON.stringify(s.store.list())
  const res = await request(port, 'PUT', '/api/knj-prompts/scenes', { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' }, JSON.stringify({ scenes: 'not-an-array' }))
  assert.equal(res.status, 400, 'scenes 非数组必须 400')
  assert.equal(JSON.stringify(s.store.list()), before, '库不得被清空')
})

test('PUT 超大请求体 → 413 响应必须能到达客户端（不 destroy 连接）', { timeout: 8000 }, async (t) => {
  const s = startServer()
  t.after(() => { s.server.close(); s.dispose(); rmSync(s.dir, { recursive: true, force: true }) })
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r))
  const port = s.server.address().port
  const huge = 'x'.repeat(1200 * 1024) // > 1MB 上限
  const res = await request(port, 'PUT', '/api/knj-prompts/scenes', { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' }, huge)
  assert.equal(res.status, 413, '客户端应收到 413 响应（旧行为 destroy 连接，响应永远送不到/挂死）')
})

test('vars GET 返回空库', async (t) => {
  const s = startServer()
  t.after(() => { s.server.close(); s.dispose(); rmSync(s.dir, { recursive: true, force: true }) })
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r))
  const port = s.server.address().port
  const res = await request(port, 'GET', '/api/knj-prompts/vars')
  const data = JSON.parse(res.body)
  assert.equal(res.status, 200)
  assert.equal(data.vars.length, 0)
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('vars PUT 同源保存成功（trim 名称与值）', async (t) => {
  const s = startServer()
  t.after(() => { s.server.close(); s.dispose(); rmSync(s.dir, { recursive: true, force: true }) })
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r))
  const port = s.server.address().port
  const payload = { vars: [{ name: ' 项目 ', value: ' iobs_pro ', updatedAt: '' }] }
  const res = await request(port, 'PUT', '/api/knj-prompts/vars', { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' }, JSON.stringify(payload))
  const data = JSON.parse(res.body)
  assert.equal(res.status, 200)
  assert.equal(data.vars.length, 1)
  assert.equal(data.vars[0].name, '项目')
  assert.equal(data.vars[0].value, 'iobs_pro')
})

test('vars PUT 重复名（大小写不敏感）→ 400 且库不变', async (t) => {
  const s = startServer()
  t.after(() => { s.server.close(); s.dispose(); rmSync(s.dir, { recursive: true, force: true }) })
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r))
  const port = s.server.address().port
  const before = JSON.stringify(s.varStore.list())
  const payload = { vars: [
    { name: 'Project', value: 'A', updatedAt: '' },
    { name: 'project', value: 'B', updatedAt: '' },
  ] }
  const res = await request(port, 'PUT', '/api/knj-prompts/vars', { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' }, JSON.stringify(payload))
  assert.equal(res.status, 400, '重复变量名必须 400')
  assert.equal(JSON.stringify(s.varStore.list()), before, '库不得被污染')
})

test('vars PUT 空值 → 400', async (t) => {
  const s = startServer()
  t.after(() => { s.server.close(); s.dispose(); rmSync(s.dir, { recursive: true, force: true }) })
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r))
  const port = s.server.address().port
  const before = JSON.stringify(s.varStore.list())
  const res = await request(port, 'PUT', '/api/knj-prompts/vars', { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' }, JSON.stringify({ vars: [{ name: 'x', value: '  ', updatedAt: '' }] }))
  assert.equal(res.status, 400, '空值必须 400')
  assert.equal(JSON.stringify(s.varStore.list()), before)
})
