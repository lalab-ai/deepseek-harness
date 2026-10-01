import { chmod, lstat, mkdir, mkdtemp, readlink, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { makeLinuxPackageReadable } from '../scripts/linux-package-permissions.mjs'

it.skipIf(process.platform === 'win32')('makes installed files public without changing executable flags or following symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-linux-permissions-'))
  try {
    const app = join(root, 'application')
    const resources = join(app, 'resources')
    await mkdir(resources, { recursive: true })
    await chmod(app, 0o770)
    await chmod(resources, 0o770)
    const executable = join(app, 'deepseek-harness')
    const sandbox = join(app, 'chrome-sandbox')
    const data = join(resources, 'app.asar')
    const outside = join(root, 'outside')
    await writeFile(executable, 'executable\n')
    await chmod(executable, 0o4750)
    await writeFile(sandbox, 'sandbox\n')
    await chmod(sandbox, 0o755)
    await writeFile(data, 'archive\n')
    await chmod(data, 0o660)
    await writeFile(outside, 'outside\n')
    await chmod(outside, 0o600)
    const link = join(resources, 'link')
    await symlink(outside, link)
    await makeLinuxPackageReadable(app)
    for (const directory of [app, resources]) expect((await stat(directory)).mode & 0o777).toBe(0o755)
    expect((await stat(executable)).mode & 0o7777).toBe(0o4755)
    expect((await stat(sandbox)).mode & 0o7777).toBe(0o4755)
    expect((await stat(data)).mode & 0o777).toBe(0o644)
    expect((await stat(outside)).mode & 0o777).toBe(0o600)
    expect((await lstat(link)).isSymbolicLink()).toBe(true)
    expect(await readlink(link)).toBe(outside)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
