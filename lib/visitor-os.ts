/**
 * The operating system of the visitor, for the download entries.
 * MQS Desktop has builds for macOS and Windows. Each other system (phones, Linux) is "other".
 * The server reads the request headers. The client corrects the value after hydration.
 * The user agent string comes first, because a browser with a changed user agent can keep its real client hints.
 */
export type VisitorOs = 'mac' | 'windows' | 'other'
export type DownloadOs = Exclude<VisitorOs, 'other'>

export const DOWNLOAD_OSES: readonly DownloadOs[] = ['mac', 'windows']

export function isDownloadOs(value: unknown): value is DownloadOs {
  return value === 'mac' || value === 'windows'
}

export function osFromUserAgent(userAgent: string | null | undefined): VisitorOs | null {
  const ua = userAgent ?? ''
  if (!ua) return null
  // iPhone and iPad user agents also hold "Mac OS X". Test the phones first.
  if (/iPhone|iPad|iPod|Android|Mobile/iu.test(ua)) return 'other'
  if (/Windows/iu.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/iu.test(ua)) return 'mac'
  if (/Linux|CrOS|X11/iu.test(ua)) return 'other'
  return null
}

/** The `Sec-CH-UA-Platform` client hint, for example `"macOS"`. */
export function osFromPlatformHint(platform: string | null | undefined): VisitorOs | null {
  const value = platform?.trim().replace(/^"|"$/gu, '').toLowerCase()
  if (!value) return null
  if (value === 'macos') return 'mac'
  if (value === 'windows') return 'windows'
  return 'other'
}

/** The system from the request headers. A request with no usable header gives "other". */
export function osFromRequestHeaders(headers: { get(name: string): string | null }): VisitorOs {
  return osFromUserAgent(headers.get('user-agent')) ?? osFromPlatformHint(headers.get('sec-ch-ua-platform')) ?? 'other'
}

/** The system in the browser. An iPad that tells it is a Mac has a touch screen; a Mac has none. */
export function osFromNavigator(input: { userAgent?: string; platformHint?: string; maxTouchPoints?: number }): VisitorOs {
  const os = osFromUserAgent(input.userAgent) ?? osFromPlatformHint(input.platformHint) ?? 'other'
  if (os === 'mac' && (input.maxTouchPoints ?? 0) > 1) return 'other'
  return os
}

/** The order of the download buttons: the system of the visitor first. "other" keeps macOS first. */
export function downloadOrder(os: VisitorOs): DownloadOs[] {
  return os === 'windows' ? ['windows', 'mac'] : ['mac', 'windows']
}
