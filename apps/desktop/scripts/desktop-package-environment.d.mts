/** Load packaging settings without changing the caller's process environment. */

/**
 * Read official macOS/Windows dotenv settings; GitHub and Linux builds use credential-free environment settings.
 * @param platform Target platform.
 * @param environment Parent build environment; GitHub and Linux accept app ID and registry settings.
 * @param appRoot Desktop application directory; relative credential paths resolve here.
 * @returns Packaging environment with unrelated release settings removed.
 */
export function loadDesktopPackageEnvironment(
  platform: 'win32' | 'darwin' | 'linux',
  environment?: NodeJS.ProcessEnv,
  appRoot?: string,
): NodeJS.ProcessEnv

/**
 * Validate release configuration before preparation without invoking a token or Apple's services.
 * @param environment Loaded packaging settings.
 * @param target Selected release target.
 * @param options Explicit packaging mode.
 * @returns Nothing.
 */
export function validateDesktopPackageEnvironment(
  environment: NodeJS.ProcessEnv,
  target: { platform: 'win32' | 'darwin' | 'linux', arch: string },
  options?: { unsigned?: boolean, prepareOnly?: boolean },
): void
