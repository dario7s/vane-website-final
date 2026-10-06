import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  loadReleaseManifest,
  macOsMajor,
  MANIFEST_REVALIDATE_SECONDS,
  parseReleaseManifest,
  pickMacFile,
  readBoundedText,
  releaseFileSchema,
  releaseManifestSchema,
  resolveManifestUrl,
} from './release-manifest'

const MANIFEST_URL = 'https://download.example.test/mac/test/manifest.json'
const EXAMPLE_SHA = '50d858e0985ecc7f60418aaf0cc5ab587f42c2570a884095a9e8ccacd0f6545c' // sha256("example")

function validManifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'mqs-release-manifest/1',
    product: 'MQS',
    channel: 'test',
    version: '0.0.0-example.1',
    releasedAt: '2026-10-06T12:00:00Z',
    signed: false,
    label: 'EXAMPLE manifest, not a real build',
    releaseNotesUrl: null,
    sourceCommit: 'e52c8d0e9c44265ea181f71ca62ab9f1d615f103',
    minimumOs: { mac: '12.0' },
    files: [
      { os: 'mac', arch: 'arm64', kind: 'zip', name: 'MQS-example-arm64.zip', url: 'MQS-example-arm64.zip', bytes: 1234, sha256: EXAMPLE_SHA },
      { os: 'mac', arch: 'arm64', kind: 'dmg', name: 'MQS-example-arm64.dmg', url: 'MQS-example-arm64.dmg', bytes: 123_456_789, sha256: EXAMPLE_SHA },
    ],
    ...overrides,
  }
}

const jsonSchema = JSON.parse(
  readFileSync(fileURLToPath(new URL('./release-manifest.schema.json', import.meta.url)), 'utf8'),
) as {
  required: string[]
  properties: Record<string, { enum?: string[]; const?: string; required?: string[]; properties?: Record<string, unknown>; items?: { required: string[]; properties: Record<string, { enum?: string[] }> } }>
}

describe('zod schema mirrors lib/release-manifest.schema.json', () => {
  it('has the same top-level properties and required keys', () => {
    expect(Object.keys(releaseManifestSchema.shape).sort()).toEqual(Object.keys(jsonSchema.properties).sort())
    const zodRequired = Object.entries(releaseManifestSchema.shape)
      .filter(([, field]) => !field.safeParse(undefined).success)
      .map(([key]) => key)
      .sort()
    expect(zodRequired).toEqual([...jsonSchema.required].sort())
  })

  it('has the same file properties, required keys and enums', () => {
    const items = jsonSchema.properties.files.items!
    expect(Object.keys(releaseFileSchema.shape).sort()).toEqual(Object.keys(items.properties).sort())
    expect(Object.keys(releaseFileSchema.shape).sort()).toEqual([...items.required].sort())
    for (const key of ['os', 'arch', 'kind'] as const) {
      expect(releaseFileSchema.shape[key].options).toEqual(items.properties[key].enum)
    }
    expect(releaseManifestSchema.shape.channel.options).toEqual(jsonSchema.properties.channel.enum)
    expect(releaseManifestSchema.shape.schemaVersion.value).toBe(jsonSchema.properties.schemaVersion.const)
  })
})

describe('parseReleaseManifest', () => {
  it('accepts a valid manifest and resolves relative file URLs against the manifest URL', () => {
    const manifest = parseReleaseManifest(validManifest(), MANIFEST_URL)
    expect(manifest).not.toBeNull()
    expect(manifest!.files[1].url).toBe('https://download.example.test/mac/test/MQS-example-arm64.dmg')
    expect(pickMacFile(manifest!)?.kind).toBe('dmg')
  })

  it.each([
    ['an unknown top-level key', { extra: true }],
    ['the wrong schema version', { schemaVersion: 'mqs-release-manifest/2' }],
    ['another product', { product: 'Other' }],
    ['an unknown channel', { channel: 'nightly' }],
    ['a malformed version', { version: 'v1' }],
    ['a date without a time zone', { releasedAt: '2026-10-06T12:00:00' }],
    ['a non-boolean signed flag', { signed: 'no' }],
    ['a label over 200 characters', { label: 'x'.repeat(201) }],
    ['a short source commit', { sourceCommit: 'abc123' }],
    ['an unknown minimumOs key', { minimumOs: { linux: '6' } }],
    ['no files', { files: [] }],
    ['a missing label', { label: undefined }],
  ])('refuses %s', (_case, overrides) => {
    expect(parseReleaseManifest(validManifest(overrides), MANIFEST_URL)).toBeNull()
  })

  it.each([
    ['an uppercase checksum', { sha256: EXAMPLE_SHA.toUpperCase() }],
    ['a short checksum', { sha256: 'abc' }],
    ['zero bytes', { bytes: 0 }],
    ['fractional bytes', { bytes: 1.5 }],
    ['a file name with a slash', { name: 'a/b.dmg' }],
    ['an unknown file kind', { kind: 'pkg' }],
    ['an extra file key', { signedBy: 'me' }],
    ['a javascript: URL', { url: 'javascript:alert(1)' }],
    ['a data: URL', { url: 'data:text/html,hi' }],
    ['plain HTTP on a public host', { url: 'http://download.example.test/MQS.dmg' }],
    ['credentials in the URL', { url: 'https://user:pass@download.example.test/MQS.dmg' }],
  ])('refuses a file with %s', (_case, fileOverrides) => {
    const base = validManifest()
    const files = [{ ...base.files[1], ...fileOverrides }]
    expect(parseReleaseManifest({ ...base, files }, MANIFEST_URL)).toBeNull()
  })

  it('drops an unusable release-notes URL instead of linking it', () => {
    const manifest = parseReleaseManifest(validManifest({ releaseNotesUrl: 'javascript:alert(1)' }), MANIFEST_URL)
    expect(manifest?.releaseNotesUrl).toBeNull()
  })

  it('allows plain HTTP only on a local development host', () => {
    expect(resolveManifestUrl('MQS.dmg', 'http://127.0.0.1:4100/manifest.json')).toBe('http://127.0.0.1:4100/MQS.dmg')
    expect(resolveManifestUrl('MQS.dmg', 'http://example.test/manifest.json')).toBeNull()
  })

  it('reads the macOS major version', () => {
    expect(macOsMajor('12.0')).toBe('12')
    expect(macOsMajor('13')).toBe('13')
    expect(macOsMajor('latest')).toBeNull()
    expect(macOsMajor(undefined)).toBeNull()
  })
})

describe('loadReleaseManifest', () => {
  const ok = (body: string, status = 200) => async () => new Response(body, { status })

  it('shows no release when no URL is configured, without fetching', async () => {
    const fetcher = vi.fn()
    await expect(loadReleaseManifest('', fetcher)).resolves.toEqual({ state: 'none' })
    await expect(loadReleaseManifest(undefined, fetcher)).resolves.toEqual({ state: 'none' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refuses a non-HTTPS manifest URL', async () => {
    const fetcher = vi.fn()
    await expect(loadReleaseManifest('ftp://example.test/manifest.json', fetcher)).resolves.toEqual({ state: 'none' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('shows no release on a network failure', async () => {
    const fetcher = vi.fn(async () => { throw new TypeError('fetch failed') })
    await expect(loadReleaseManifest(MANIFEST_URL, fetcher)).resolves.toEqual({ state: 'none' })
  })

  it('shows no release on a non-2xx answer', async () => {
    await expect(loadReleaseManifest(MANIFEST_URL, ok('{}', 404))).resolves.toEqual({ state: 'none' })
  })

  it('shows no release on malformed JSON or an invalid manifest', async () => {
    await expect(loadReleaseManifest(MANIFEST_URL, ok('<html>'))).resolves.toEqual({ state: 'none' })
    await expect(loadReleaseManifest(MANIFEST_URL, ok(JSON.stringify(validManifest({ product: 'X' }))))).resolves.toEqual({ state: 'none' })
  })

  it('returns the manifest and asks Next to revalidate every few minutes', async () => {
    const fetcher = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(ok(JSON.stringify(validManifest())))
    const result = await loadReleaseManifest(MANIFEST_URL, fetcher)
    expect(result.state).toBe('ready')
    const init = fetcher.mock.calls[0][1] as unknown as { next: { revalidate: number }; redirect: string }
    expect(init.next.revalidate).toBe(MANIFEST_REVALIDATE_SECONDS)
    expect(MANIFEST_REVALIDATE_SECONDS).toBeLessThanOrEqual(600)
    expect(init.redirect).toBe('follow')
  })

  function redirected(body: string, finalUrl: string, headers: Record<string, string> = {}) {
    return async () => {
      const response = new Response(body, { status: 200, headers })
      Object.defineProperty(response, 'url', { value: finalUrl })
      return response
    }
  }

  it('follows a redirect (GitHub Releases answers 302) and resolves files against the final URL', async () => {
    const finalUrl = 'https://objects.example.test/releases/abc/manifest.json'
    const result = await loadReleaseManifest(MANIFEST_URL, redirected(JSON.stringify(validManifest()), finalUrl))
    expect(result.state).toBe('ready')
    if (result.state !== 'ready') return
    expect(result.manifest.files[1].url).toBe('https://objects.example.test/releases/abc/MQS-example-arm64.dmg')
  })

  it('refuses a redirect that ends on plain HTTP', async () => {
    const result = await loadReleaseManifest(MANIFEST_URL, redirected(JSON.stringify(validManifest()), 'http://objects.example.test/manifest.json'))
    expect(result).toEqual({ state: 'none' })
  })

  it('refuses a declared Content-Length over the limit without reading the body', async () => {
    const body = new ReadableStream({ pull: () => { throw new Error('body must not be read') } })
    const fetcher = async () => new Response(body, { status: 200, headers: { 'content-length': String(300 * 1024) } })
    await expect(loadReleaseManifest(MANIFEST_URL, fetcher)).resolves.toEqual({ state: 'none' })
  })
})

describe('readBoundedText', () => {
  it('counts bytes, not characters', async () => {
    const text = 'ä'.repeat(6) // 6 characters, 12 UTF-8 bytes
    await expect(readBoundedText(new Response(text), 12)).resolves.toBe(text)
    await expect(readBoundedText(new Response(text), 11)).resolves.toBeNull()
  })

  it('stops a body without Content-Length once it passes the limit', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(100))
    let pulls = 0
    const stream = new ReadableStream<Uint8Array>({ pull: (controller) => { pulls++; controller.enqueue(chunk) } })
    await expect(readBoundedText(new Response(stream), 250)).resolves.toBeNull()
    expect(pulls).toBeLessThan(10)
  })

  it('refuses a malformed Content-Length', async () => {
    await expect(readBoundedText(new Response('{}', { headers: { 'content-length': 'abc' } }))).resolves.toBeNull()
  })
})
