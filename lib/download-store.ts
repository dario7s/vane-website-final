import 'server-only'
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
  | { ok: false; reason: 'production' | 'no-key' | 'bad-channel' }

/**
 * The key and the channel from `MQS_DOWNLOAD_TOKEN_SIGNING_KEY` and `MQS_DOWNLOAD_CHANNEL`.
 * A production deployment never signs, also when a key is set by mistake. Production gets its tokens from the MQS service.
 */
export function downloadConfig(env: Record<string, string | undefined> = process.env, now: () => number = Date.now): DownloadConfig {
  if (env.VERCEL_ENV === 'production') return { ok: false, reason: 'production' }
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

const INSTALLER_EXTENSION: Record<DownloadOs, string> = { mac: '.dmg', windows: '.exe' }

/**
 * The address of the installer on the download host: exactly `/mqs/<channel>/<file.name>`.
 * The manifest URL can be relative to the manifest, but it must name the same file.
 * Each other target gives null: another host, an encoded byte, a `releases/` path, a manifest or another name.
 */
export function installerUrl(file: ManifestFile, channel: string, os: DownloadOs): URL | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u.test(file.name) || !file.name.endsWith(INSTALLER_EXTENSION[os])) return null
  if (file.url.includes('%')) return null
  let url: URL
  try {
    url = new URL(file.url, manifestUrl(channel, os))
  } catch {
    return null
  }
  if (url.origin !== DOWNLOAD_ORIGIN || url.username || url.password) return null
  if (url.pathname.includes('%') || url.pathname !== `/mqs/${channel}/${file.name}`) return null
  if (url.pathname.split('/').pop() !== file.name) return null
  return new URL(`${DOWNLOAD_ORIGIN}/mqs/${channel}/${file.name}`)
}

export type ManifestResult =
  | { ok: true; manifest: ReleaseManifest; text: string }
  | { ok: false; status: number; reason: string }

/** Reads `manifest-<os>.json` of the channel with a new token. The token never goes into a log line. */
export async function fetchManifest(config: Extract<DownloadConfig, { ok: true }>, os: DownloadOs,
  fetcher: typeof fetch = fetch, timeoutMs = FETCH_TIMEOUT_MS): Promise<ManifestResult> {
  let text: string
  try {
    // The timeout covers the body too. A redirect is an error: the manifest must come from this address.
    const response = await fetcher(manifestUrl(config.channel, os), {
      headers: { Authorization: `Bearer ${config.token()}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status === 404) return { ok: false, status: 404, reason: `No ${os} build is published.` }
    if (!response.ok) return { ok: false, status: 502, reason: `The download host answered ${response.status}.` }
    const bytes = await readLimited(response, MANIFEST_MAX_BYTES)
    if (bytes === null) return { ok: false, status: 502, reason: 'The manifest is too large.' }
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return { ok: false, status: 502, reason: 'The download host did not answer.' }
  }
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

/** The body as bytes, or null when it is longer than `limit` bytes. It stops reading at the limit. */
async function readLimited(response: Response, limit: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) return null
  if (!response.body) return new Uint8Array(0)
  const reader = response.body.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    parts.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }
  return bytes
}

/** The facts that the download page shows for one system. */
export type DownloadInfo = { os: DownloadOs; version: string; bytes: number; name: string; label: string } | { os: DownloadOs; version: null }

export async function downloadInfo(os: DownloadOs, config = downloadConfig(), fetcher: typeof fetch = fetch,
  timeoutMs = FETCH_TIMEOUT_MS): Promise<DownloadInfo> {
  if (!config.ok) return { os, version: null }
  // A failure of the download host never breaks the page. The page then shows the "not available" line.
  const result = await fetchManifest(config, os, fetcher, timeoutMs).catch(() => null)
  if (!result || !result.ok) return { os, version: null }
  const file = pickInstaller(result.manifest, os)
  if (!file) return { os, version: null }
  return { os, version: result.manifest.version, bytes: file.bytes, name: file.name, label: result.manifest.label }
}
