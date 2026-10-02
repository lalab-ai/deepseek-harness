import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { signAdHocMacOSRuntime, signMacOSRuntime } from '../scripts/macos-runtime.ts'
import { signMacOSRuntimeCode, verifyMacOSRuntimeCode } from '../scripts/verify-macos-signature.mjs'

vi.mock('../scripts/verify-macos-signature.mjs', () => ({ signMacOSRuntimeCode: vi.fn(), verifyMacOSRuntimeCode: vi.fn() }))
const { execute } = vi.hoisted(() => ({ execute: vi.fn(async () => undefined) }))
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>()
  const { promisify } = await import('node:util')
  return { ...original, execFile: Object.assign(vi.fn(), { [promisify.custom]: execute }) }
})
const roots: string[] = []
function root(): string {
  const path = mkdtempSync(join(tmpdir(), 'desktop-signing-'))
  roots.push(path)
  return path
}
const identity = { signingIdentity: 'Example (TEAMID1234)', teamId: 'TEAMID1234' }
afterEach(() => {
  vi.resetAllMocks()
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true })
})
it('signs Mach-O files in their final locations and verifies each signature', async () => {
  const path = root()
  writeFileSync(join(path, 'addon.node'), Buffer.from('cffaedfe00000000', 'hex'))
  writeFileSync(join(path, 'source.js'), 'export {}')
  await expect(signMacOSRuntime(path, 'com.example.app', identity, 'arm64')).resolves.toBe(1)
  expect(signMacOSRuntimeCode).toHaveBeenCalledWith(join(path, 'addon.node'), expect.stringMatching(/^com\.example\.app\.runtime\.[a-f0-9]{64}$/u), identity, undefined)
  expect(verifyMacOSRuntimeCode).toHaveBeenCalledWith(join(path, 'addon.node'), identity)
})
it('awaits other signers before rejecting and permitting output cleanup', async () => {
  const path = root()
  for (const name of ['a.node', 'b.node']) writeFileSync(join(path, name), Buffer.from('cffaedfe00000000', 'hex'))
  let release!: () => void
  const barrier = new Promise<void>((resolve) => { release = resolve })
  let started!: () => void
  const ready = new Promise<void>((resolve) => { started = resolve })
  vi.mocked(signMacOSRuntimeCode).mockImplementation(async (file) => {
    if (file.endsWith('a.node')) throw new Error('sign failure')
    started()
    await barrier
  })
  let completed = false
  const result = signMacOSRuntime(path, 'com.example.app', identity, 'arm64').catch((error: unknown) => { completed = true; return error })
  try {
    await ready
    expect(completed).toBe(false)
  } finally { release() }
  expect(await result).toBeInstanceOf(AggregateError)
  expect(verifyMacOSRuntimeCode).toHaveBeenCalledWith(join(path, 'b.node'), identity)
})

it.each(['arm64', 'x64'] as const)('selects %s Node entitlements and keeps helpers JIT-only', async (arch) => {
  const path = root()
  mkdirSync(join(path, 'dependencies/node/bin'), { recursive: true })
  const node = join(path, 'dependencies/node/bin/node')
  const addon = join(path, 'addon.node')
  const helpers = ['arm64', 'x64'].map(helperArch => join(path, 'node_modules/@deepseek-ai', `libreoffice-kit-darwin-${helperArch}`, 'bin/libreoffice-kit'))
  for (const helper of helpers) mkdirSync(join(helper, '..'), { recursive: true })
  for (const file of [node, addon, ...helpers]) writeFileSync(file, Buffer.from('cffaedfe00000000', 'hex'))
  await signMacOSRuntime(path, 'com.example.app', identity, arch)
  const nodePlist = join(import.meta.dirname, '../scripts', arch === 'x64' ? 'node-x64-entitlements.plist' : 'jit-entitlements.plist')
  expect(signMacOSRuntimeCode).toHaveBeenCalledWith(node, expect.any(String), identity, nodePlist)
  const xml = readFileSync(nodePlist, 'utf8')
  expect(xml).toMatch(/<key>com\.apple\.security\.cs\.allow-jit<\/key>\s*<true\s*\/>/u)
  expect(/<key>com\.apple\.security\.cs\.allow-unsigned-executable-memory<\/key>\s*<true\s*\/>/u.test(xml)).toBe(arch === 'x64')
  for (const file of helpers) {
    expect(signMacOSRuntimeCode).toHaveBeenCalledWith(file, expect.any(String), identity,
      join(import.meta.dirname, '../scripts/jit-entitlements.plist'))
  }
  expect(signMacOSRuntimeCode).toHaveBeenCalledWith(addon, expect.any(String), identity, undefined)
})

it.each(['arm64', 'x64'] as const)('seals community %s Node code with an ad hoc signature and verifies it', async (arch) => {
  const path = root()
  const node = join(path, 'dependencies/node/bin/node')
  mkdirSync(join(node, '..'), { recursive: true })
  writeFileSync(node, Buffer.from('cffaedfe00000000', 'hex'))
  writeFileSync(join(path, 'data.json'), '{}')
  await expect(signAdHocMacOSRuntime(path, 'com.example.app', arch)).resolves.toBe(1)
  expect(execute).toHaveBeenCalledWith('/usr/bin/codesign', [
    '--force', '--sign', '-', '--identifier', expect.stringMatching(/^com\.example\.app\.runtime\.[a-f0-9]{64}$/u),
    '--entitlements', join(import.meta.dirname, '../scripts', arch === 'x64' ? 'node-x64-entitlements.plist' : 'jit-entitlements.plist'), node,
  ])
  expect(execute).toHaveBeenCalledWith('/usr/bin/codesign', ['--verify', '--strict', node])
  expect(execute).toHaveBeenCalledTimes(2)
})

it('waits for community signers to finish before reporting a signing failure', async () => {
  const path = root()
  for (const name of ['a.node', 'b.node']) writeFileSync(join(path, name), Buffer.from('cffaedfe00000000', 'hex'))
  let release!: () => void
  const barrier = new Promise<void>((resolve) => { release = resolve })
  let started!: () => void
  const ready = new Promise<void>((resolve) => { started = resolve })
  execute.mockImplementation(async (_command?: string, args?: string[]) => {
    if (args?.includes('--force') !== true) return
    if (args.at(-1)?.endsWith('a.node') === true) throw new Error('ad hoc signing failed')
    started()
    await barrier
  })
  let completed = false
  const result = signAdHocMacOSRuntime(path, 'com.example.app', 'arm64').catch((error: unknown) => { completed = true; return error })
  try {
    await ready
    expect(completed).toBe(false)
  } finally { release() }
  expect(await result).toMatchObject({ message: 'ad hoc signing failed' })
  expect(execute).toHaveBeenCalledWith('/usr/bin/codesign', ['--verify', '--strict', join(path, 'b.node')])
})
