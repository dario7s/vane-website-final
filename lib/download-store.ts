import { signDownloadToken, signingKeyFromJwk } from './download-token'
import type { DownloadOs } from './visitor-os'

/**
 * Reads the release manifests of the private release store through the download host, for the staging site.
 * This branch serves the channel `test` only. A link never opens `mqs/stable/` or `mqs/beta/`.
 * Server code only: it reads the signing key from the environment.
 */
export const DOWNLOAD_ORIGIN = 'https://download.vanescience.com'
export const ALLOWED_CHANNELS = ['test'] as const
const FETCH_TIMEOUT_MS = 5_000
const MANIFEST_MAX_BYTES = 256 * 1024

export type ManifestFile = {
  os: string
  arch: string
  kind: string
  name: string
  url: string
  bytes: number
  sha256: string
}

export type ReleaseManifest = {
  schemaVersion: string
  channel: string
  version: string
  releasedAt: string
  signed: boolean
  label: string
  files: ManifestFile[]
}

export type DownloadConfig =
  | { ok: true; channel: string; token: () => string }
  | { ok: false; reason: 'no-key' | 'bad-channel' }

/** The key and the channel from `MQS_DOWNLOAD_TOKEN_SIGNING_KEY` and `MQS_DOWNLOAD_CHANNEL`. */
export function downloadConfig(env: Record<string, string | undefined> = process.env, now: () => number = Date.now): DownloadConfig {
  const channel = (env.MQS_DOWNLOAD_CHANNEL ?? '').trim()
  if (!(ALLOWED_CHANNELS as readonly string[]).includes(channel)) return { ok: false, reason: 'bad-channel' }
  const key = signingKeyFromJwk(env.MQS_DOWNLOAD_TOKEN_SIGNING_KEY)
  if (!key) return { ok: false, reason: 'no-key' }
  return { ok: true, channel, token: () => signDownloadToken(key, [channel], Math.floor(now() / 1000)) }
}

export function manifestUrl(channel: string, os: DownloadOs): string {
  return `${DOWNLOAD_ORIGIN}/mqs/${channel}/manifest-${os}.json`
}

function isManifestFile(value: unknown): value is ManifestFile {
  const file = value as ManifestFile
  return typeof file === 'object' && file !== null && typeof file.name === 'string' && /^[A-Za-z0-9._-]+$/u.test(file.name) &&
    typeof file.os === 'string' && typeof file.kind === 'string' && typeof file.url === 'string' &&
    Number.isSafeInteger(file.bytes) && file.bytes > 0 && typeof file.sha256 === 'string' && /^[0-9a-f]{64}$/u.test(file.sha256)
}

/** The manifest when it has the fields this site reads, else null. */
export function parseManifest(value: unknown, channel: string): ReleaseManifest | null {
  const manifest = value as ReleaseManifest
  if (typeof manifest !== 'object' || manifest === null) return null
  if (manifest.schemaVersion !== 'mqs-release-manifest/1' || manifest.channel !== channel) return null
  if (typeof manifest.version !== 'string' || !Array.isArray(manifest.files) || !manifest.files.every(isManifestFile)) return null
  return manifest
}

/** The installer of a system: the DMG on macOS (Apple silicon first), the NSIS installer on Windows. */
export function pickInstaller(manifest: ReleaseManifest, os: DownloadOs): ManifestFile | null {
  const files = manifest.files.filter((file) => file.os === os)
  if (os === 'mac') {
    return files.find((file) => file.kind === 'dmg' && file.arch === 'arm64') ?? files.find((file) => file.kind === 'dmg') ?? null
  }
  return files.find((file) => file.kind === 'nsis' && file.arch === 'x64') ?? files.find((file) => file.kind === 'nsis') ?? null
}

/**
 * The address of the file on the download host. The manifest URL can be relative to the manifest.
 * An address outside `mqs/<channel>/` on the download host gives null.
 */
export function installerUrl(file: ManifestFile, channel: string, os: DownloadOs): URL | null {
  let url: URL
  try {
    url = new URL(file.url, manifestUrl(channel, os))
  } catch {
    return null
  }
  if (url.origin !== DOWNLOAD_ORIGIN || url.username || url.password) return null
  if (!url.pathname.startsWith(`/mqs/${channel}/`) || url.pathname.includes('..')) return null
  url.search = ''
  url.hash = ''
  return url
}

export type ManifestResult =
  | { ok: true; manifest: ReleaseManifest; text: string }
  | { ok: false; status: number; reason: string }

/** Reads `manifest-<os>.json` of the channel with a new token. The token never goes into a log line. */
export async function fetchManifest(config: Extract<DownloadConfig, { ok: true }>, os: DownloadOs,
  fetcher: typeof fetch = fetch): Promise<ManifestResult> {
  let response: Response
  try {
    response = await fetcher(manifestUrl(config.channel, os), {
      headers: { Authorization: `Bearer ${config.token()}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    return { ok: false, status: 502, reason: 'The download host did not answer.' }
  }
  if (response.status === 404) return { ok: false, status: 404, reason: `No ${os} build is published.` }
  if (!response.ok) return { ok: false, status: 502, reason: `The download host answered ${response.status}.` }
  const text = await response.text()
  if (text.length > MANIFEST_MAX_BYTES) return { ok: false, status: 502, reason: 'The manifest is too large.' }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, status: 502, reason: 'The manifest is not JSON.' }
  }
  const manifest = parseManifest(parsed, config.channel)
  if (!manifest) return { ok: false, status: 502, reason: 'The manifest does not have the expected form.' }
  return { ok: true, manifest, text }
}

/** The facts that the download page shows for one system. */
export type DownloadInfo = { os: DownloadOs; version: string; bytes: number; name: string; label: string } | { os: DownloadOs; version: null }

export async function downloadInfo(os: DownloadOs, config = downloadConfig()): Promise<DownloadInfo> {
  if (!config.ok) return { os, version: null }
  const result = await fetchManifest(config, os)
  if (!result.ok) return { os, version: null }
  const file = pickInstaller(result.manifest, os)
  if (!file) return { os, version: null }
  return { os, version: result.manifest.version, bytes: file.bytes, name: file.name, label: result.manifest.label }
}
