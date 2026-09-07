import assert from 'node:assert/strict'
import test from 'node:test'
import { isZipSignature, packageUploadError, safePackageFilename } from './src/scene-package.ts'

test('safePackageFilename preserves zip extension with a server-safe basename', () => {
  assert.equal(safePackageFilename('../../客户 场景.ZIP'), '客户-场景.zip')
  assert.equal(safePackageFilename('   .zip'), 'scene-package.zip')
})

test('packageUploadError rejects unsupported or oversized uploads', () => {
  assert.equal(packageUploadError('scene.txt', 1), 'zip files only')
  assert.equal(packageUploadError('scene.zip', 25 * 1024 * 1024), 'package too large')
  assert.equal(packageUploadError('scene.zip', 1), null)
})

test('isZipSignature rejects arbitrary bytes named as ZIP', () => {
  assert.equal(isZipSignature(Buffer.from('hello')), false)
  assert.equal(isZipSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04])), true)
  assert.equal(isZipSignature(Buffer.from([0x50, 0x4b, 0x05, 0x06])), true)
})
