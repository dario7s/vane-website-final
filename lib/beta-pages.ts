/**
 * Beta pages: reachable by direct link (invite emails, the app), never indexed,
 * never in the sitemap and never in the site navigation.
 */
export const BETA_PAGE_PATHS = [
  '/download',
  '/pricing',
  '/account',
  '/legal/subscription-terms',
  '/legal/refunds',
  '/legal/app-privacy',
] as const

/** Page-level metadata; overrides the root layout's `index: true`. */
export const betaRobots = { index: false, follow: false } as const

/** Response header for the same paths (see next.config.ts). */
export const BETA_ROBOTS_HEADER = { key: 'X-Robots-Tag', value: 'noindex, nofollow' } as const
