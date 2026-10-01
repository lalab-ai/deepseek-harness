/** Installed Linux resources must be readable by users other than the build account. */

import { chmod, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Set public read permissions while preserving executable files and symlinks.
 * @param {string} root - Assembled Linux application directory.
 * @returns {Promise<void>} Resolves when all physical entries are accessible to installed users.
 */
export async function makeLinuxPackageReadable(root) {
  await chmod(root, 0o755)
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    const path = join(entry.parentPath, entry.name)
    if (entry.isDirectory()) await chmod(path, 0o755)
    else if (entry.isFile()) {
      const mode = (await stat(path)).mode
      const base = mode & 0o111 ? 0o755 : 0o644
      const packagedMode = path === join(root, 'chrome-sandbox') ? 0o4755 : base | (mode & 0o7000)
      await chmod(path, packagedMode)
    }
  }
}
