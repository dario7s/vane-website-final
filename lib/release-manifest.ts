import { z } from 'zod'

/**
 * The MQS release manifest (`mqs-release-manifest/1`).
 *
 * `lib/release-manifest.schema.json` is a byte-for-byte copy of the schema the
 * MQS release script writes against (`packages/desktop/release/` in the MQS
 * repository). This zod schema is its executable twin; `release-manifest.test.ts`
 * fails if the two drift apart. Keep it free of Next.js imports so it can be
 * unit-tested in isolation.
 */

const sha256Pattern = /^[0-9a-f]{64}$/
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/
const fileNamePattern = /^[A-Za-z0-9._-]+$/
const commitPattern = /^[0-9a-f]{40}$/

export const releaseFileSchema = z.strictObject({
  os: z.enum(['mac', 'windows']),
  arch: z.enum(['arm64', 'x64']),
  kind: z.enum(['dmg', 'zip', 'nsis']),
  name: z.string().regex(fileNamePattern),
  url: z.string(),
  bytes: z.number().int().min(1),
  sha256: z.string().regex(sha256Pattern),
})

export const releaseManifestSchema = z.strictObject({
  schemaVersion: z.literal('mqs-release-manifest/1'),
  product: z.literal('MQS'),
  channel: z.enum(['test', 'beta', 'stable']),
  version: z.string().regex(versionPattern),
  // JSON Schema "date-time" is RFC 3339: a time zone offset or Z is required.
  releasedAt: z.iso.datetime({ offset: true }),
  signed: z.boolean(),
  label: z.string().max(200),
  releaseNotesUrl: z.string().nullable().optional(),
  sourceCommit: z.string().regex(commitPattern).optional(),
  minimumOs: z.strictObject({
    mac: z.string().optional(),
    windows: z.string().optional(),
  }),
  files: z.array(releaseFileSchema).min(1),
})

export type ReleaseManifest = z.infer<typeof releaseManifestSchema>
export type ReleaseFile = z.infer<typeof releaseFileSchema>

export type ManifestState =
  | { state: 'none' }
  | { state: 'ready'; manifest: ReleaseManifest }

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Resolve a URL from the manifest against the manifest's own URL (relative
 * file URLs are allowed by the schema). Only HTTPS is accepted, plus plain
 * HTTP on a local host for development. Anything else (javascript:, data:,
 * ftp:, …) is refused so it can never become a link on the page.
 */
export function resolveManifestUrl(value: string, manifestUrl: string): string | null {
  let resolved: URL
  try {
    resolved = new URL(value, manifestUrl)
  } catch {
    return null
  }
  if (resolved.username || resolved.password) return null
  if (resolved.protocol === 'https:') return resolved.toString()
  if (resolved.protocol === 'http:' && LOCAL_HOSTS.has(resolved.hostname)) return resolved.toString()
  return null
}

/**
 * Validate a parsed manifest and resolve its URLs. Returns null when the
 * manifest does not match the schema or a file URL is unusable: the page then
 * shows "no release published yet" instead of a broken or unsafe link.
 */
export function parseReleaseManifest(payload: unknown, manifestUrl: string): ReleaseManifest | null {
  const parsed = releaseManifestSchema.safeParse(payload)
  if (!parsed.success) return null

  const files: ReleaseFile[] = []
  for (const file of parsed.data.files) {
    const url = resolveManifestUrl(file.url, manifestUrl)
    if (!url) return null
    files.push({ ...file, url })
  }

  let releaseNotesUrl: string | null = null
  if (parsed.data.releaseNotesUrl) {
    releaseNotesUrl = resolveManifestUrl(parsed.data.releaseNotesUrl, manifestUrl)
  }

  return { ...parsed.data, files, releaseNotesUrl }
}

/** The file a Mac visitor should download: the disk image first, else the zip. */
export function pickMacFile(manifest: ReleaseManifest): ReleaseFile | null {
  const macFiles = manifest.files.filter((file) => file.os === 'mac')
  return (
    macFiles.find((file) => file.kind === 'dmg' && file.arch === 'arm64') ??
    macFiles.find((file) => file.kind === 'dmg') ??
    macFiles.find((file) => file.kind === 'zip') ??
    null
  )
}

/** "12" from "12", "12.0" or "12.6.1"; null when nothing usable is given. */
export function macOsMajor(minimum: string | undefined): string | null {
  const match = minimum?.trim().match(/^(\d{1,3})(?:\.\d+)*$/)
  return match ? match[1] : null
}

export const MANIFEST_REVALIDATE_SECONDS = 300
export const MANIFEST_FETCH_TIMEOUT_MS = 5_000
export const MANIFEST_MAX_BYTES = 256 * 1024

type FetchLike = (input: string, init?: RequestInit & { next?: { revalidate?: number } }) => Promise<Response>

/**
 * Read the release manifest from `MQS_RELEASE_MANIFEST_URL`.
 * No URL, a network error, a non-2xx answer, an oversized or malformed body,
 * or a schema mismatch all return `{ state: 'none' }`. It never throws.
 */
export async function loadReleaseManifest(
  manifestUrl: string | undefined = process.env.MQS_RELEASE_MANIFEST_URL,
  fetchImpl: FetchLike = fetch,
): Promise<ManifestState> {
  const url = manifestUrl?.trim()
  if (!url) return { state: 'none' }
  if (!resolveManifestUrl(url, url)) return { state: 'none' }

  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(MANIFEST_FETCH_TIMEOUT_MS),
      next: { revalidate: MANIFEST_REVALIDATE_SECONDS },
    })
    if (!response.ok) return { state: 'none' }

    const text = await response.text()
    if (text.length > MANIFEST_MAX_BYTES) return { state: 'none' }

    const manifest = parseReleaseManifest(JSON.parse(text), url)
    return manifest ? { state: 'ready', manifest } : { state: 'none' }
  } catch {
    return { state: 'none' }
  }
}
