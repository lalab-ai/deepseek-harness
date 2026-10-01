/** Installed Linux resources must be readable by users other than the build account. */

/**
 * Set public read permissions while preserving executable files and symlinks.
 * @param root - Assembled Linux application directory.
 * @returns Resolves when all physical entries are accessible to installed users.
 */
export function makeLinuxPackageReadable(root: string): Promise<void>
