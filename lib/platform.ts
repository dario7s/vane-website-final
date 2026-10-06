/**
 * Operating-system detection for the download page.
 *
 * `navigator.userAgentData.platform` is preferred where the browser offers it
 * (Chromium); everything else falls back to the user-agent string. A browser
 * cannot tell an Apple Silicon Mac from an Intel one, so the page states the
 * requirement next to the button instead of guessing.
 */
export type Platform = 'mac' | 'windows' | 'mobile' | 'other' | 'unknown'

export type DownloadOs = 'mac' | 'windows'

export function platformFromUaData(platform: string | null | undefined): Platform {
  const value = platform?.trim().replace(/^"|"$/g, '').toLowerCase()
  if (!value) return 'unknown'
  if (value === 'macos') return 'mac'
  if (value === 'windows') return 'windows'
  if (value === 'android' || value === 'ios') return 'mobile'
  return 'other'
}

export function platformFromUserAgent(userAgent: string | null | undefined): Platform {
  const ua = userAgent ?? ''
  if (!ua) return 'unknown'
  // iPhone and iPad user agents also contain "Mac OS X": test mobile first.
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return 'mobile'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac'
  if (/Linux|CrOS|X11/i.test(ua)) return 'other'
  return 'unknown'
}

export function detectPlatform(input: {
  uaDataPlatform?: string | null
  userAgent?: string | null
  maxTouchPoints?: number
}): Platform {
  const fromData = platformFromUaData(input.uaDataPlatform)
  const platform = fromData !== 'unknown' ? fromData : platformFromUserAgent(input.userAgent)
  // iPadOS Safari presents itself as a Mac; a Mac has no multi-touch screen.
  if (platform === 'mac' && (input.maxTouchPoints ?? 0) > 1) return 'mobile'
  return platform
}

/** `?os=mac` or `?os=windows` (for links in invite emails); anything else is ignored. */
export function parseRequestedOs(value: unknown): DownloadOs | null {
  const first = Array.isArray(value) ? value[0] : value
  return first === 'mac' || first === 'windows' ? first : null
}

/** Which download the primary button offers. Mac is the only build today. */
export function primaryDownloadOs(requested: DownloadOs | null, platform: Platform): DownloadOs {
  if (requested) return requested
  return platform === 'windows' ? 'windows' : 'mac'
}
