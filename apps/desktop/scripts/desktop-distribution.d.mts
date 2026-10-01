/** Select credential-free GitHub downloads or the official signed release service. */

/**
 * Validate the distribution selector before loading credentials or release services.
 * @param environment Packaging environment.
 * @returns Whether this build is an independent GitHub download without automatic updates.
 */
export function isGitHubDesktopDistribution(environment: NodeJS.ProcessEnv): boolean
