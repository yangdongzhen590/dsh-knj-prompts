import { closeSync, createWriteStream, mkdirSync, openSync, readSync, rmSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const MAX_PACKAGE_BYTES = 25 * 1024 * 1024

/** 保留 .zip，清理浏览器携带的路径和文件系统不安全字符。 */
export function safePackageFilename(filename: string): string {
  const raw = basename(filename).replace(/\.zip$/i, '')
  const cleaned = raw
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${cleaned || 'scene-package'}.zip`
}

export function packageUploadError(filename: string, size: number): string | null {
  if (!/\.zip$/i.test(filename)) return 'zip files only'
  if (!Number.isFinite(size) || size < 0 || size >= MAX_PACKAGE_BYTES) return 'package too large'
  return null
}

/** ZIP 可为普通文件、空归档或 spanned archive 的任一标准 PK 头。 */
export function isZipSignature(bytes: Buffer): boolean {
  return bytes.length >= 4
    && bytes[0] === 0x50 && bytes[1] === 0x4b
    && ((bytes[2] === 0x03 && bytes[3] === 0x04)
      || (bytes[2] === 0x05 && bytes[3] === 0x06)
      || (bytes[2] === 0x07 && bytes[3] === 0x08))
}

function fileHasZipSignature(path: string): boolean {
  const descriptor = openSync(path, 'r')
  try {
    const header = Buffer.alloc(4)
    return isZipSignature(header.subarray(0, readSync(descriptor, header, 0, 4, 0)))
  } finally { closeSync(descriptor) }
}

/** 将请求体流式写入 imports；调用方负责在写入口完成同源和 Content-Type 检查。 */
export async function stageScenePackage(request: IncomingMessage, importsDir: string, filename: string): Promise<string> {
  const declaredSize = Number(request.headers['content-length'] ?? 0)
  const preflightError = packageUploadError(filename, declaredSize)
  if (preflightError) throw new Error(preflightError)

  mkdirSync(importsDir, { recursive: true })
  const target = join(importsDir, `${Date.now()}-${randomUUID()}-${safePackageFilename(filename)}`)
  const output = createWriteStream(target, { flags: 'wx' })
  let bytes = 0

  try {
    await new Promise<void>((resolve, reject) => {
      request.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes >= MAX_PACKAGE_BYTES) {
          request.resume()
          reject(new Error('package too large'))
          return
        }
        if (!output.write(chunk)) request.pause(), output.once('drain', () => request.resume())
      })
      request.on('end', () => output.end(resolve))
      request.on('error', reject)
      output.on('error', reject)
    })
    if (!fileHasZipSignature(target)) throw new Error('invalid zip package')
    return target
  } catch (error) {
    output.destroy()
    rmSync(target, { force: true })
    throw error
  }
}
