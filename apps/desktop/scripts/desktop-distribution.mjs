/** Select credential-free GitHub downloads or the official signed release service. */

/**
 * Validate the distribution selector before loading credentials or release services.
 * @param {NodeJS.ProcessEnv} environment - Packaging environment.
 * @returns {boolean} Whether this build is an independent GitHub download without automatic updates.
 */
export function isGitHubDesktopDistribution(environment) {
  const value = environment.DSH_DESKTOP_DISTRIBUTION
  if (value === undefined || value === 'official') return false
  if (value === 'github') return true
  throw new Error('desktop package: DSH_DESKTOP_DISTRIBUTION must be official or github')
}
