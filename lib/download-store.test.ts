import { generateKeyPairSync, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { downloadConfig, fetchManifest, installerUrl, parseManifest, pickInstaller, type ReleaseManifest } from './download-store'
import { signingKeyFromJwk, TOKEN_LIFETIME_SECONDS } from './download-token'
import { downloadOrder, osFromNavigator, osFromRequestHeaders } from './visitor-os'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const jwk = JSON.stringify(privateKey.export({ format: 'jwk' }))
const NOW = 1_795_000_000_000

const file = (os: string, kind: string, name: string, arch = os === 'mac' ? 'arm64' : 'x64') =>
  ({ os, arch, kind, name, url: name, bytes: 1234, sha256: 'a'.repeat(64) })

const manifest: ReleaseManifest = {
  schemaVersion: 'mqs-release-manifest/1', channel: 'test', version: '0.1.0-test.11', releasedAt: '2026-11-20T10:00:00Z',
  signed: false, label: 'Test', files: [file('mac', 'zip', 'MQS-mac.zip'), file('mac', 'dmg', 'MQS-mac.dmg')],
}

describe('download token', () => {
  it('signs the payload of the download host with a ten-minute life', () => {
    const config = downloadConfig({ MQS_DOWNLOAD_TOKEN_SIGNING_KEY: jwk, MQS_DOWNLOAD_CHANNEL: 'test' }, () => NOW)
    if (!config.ok) throw new Error('config')
    const [body, signature] = config.token().split('.')
    expect(verify(null, Buffer.from(body, 'ascii'), publicKey, Buffer.from(signature, 'base64url'))).toBe(true)
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    expect(Object.keys(payload).sort()).toEqual(['aud', 'ch', 'exp', 'iat', 'sub', 'v'])
    expect(payload).toMatchObject({ v: 1, aud: 'download.vanescience.com', sub: 'website-staging', ch: ['test'], iat: NOW / 1000 })
    expect(payload.exp - payload.iat).toBe(TOKEN_LIFETIME_SECONDS)
    expect(TOKEN_LIFETIME_SECONDS).toBeLessThanOrEqual(600)
    expect(config.token()).toMatch(/^[A-Za-z0-9_-]{16,1900}\.[A-Za-z0-9_-]{86}$/u)
  })

  it('refuses a missing key, a public key, and each channel but test', () => {
    expect(downloadConfig({ MQS_DOWNLOAD_CHANNEL: 'test' })).toEqual({ ok: false, reason: 'no-key' })
    expect(signingKeyFromJwk(JSON.stringify(publicKey.export({ format: 'jwk' })))).toBeNull()
    for (const channel of ['stable', 'beta', '', undefined]) {
      expect(downloadConfig({ MQS_DOWNLOAD_TOKEN_SIGNING_KEY: jwk, MQS_DOWNLOAD_CHANNEL: channel })).toEqual({ ok: false, reason: 'bad-channel' })
    }
  })
})

describe('manifest', () => {
  it('picks the DMG on macOS and the NSIS installer on Windows', () => {
    expect(pickInstaller(manifest, 'mac')?.name).toBe('MQS-mac.dmg')
    const windows = { ...manifest, files: [file('windows', 'nsis', 'MQS-Setup.exe')] }
    expect(pickInstaller(windows, 'windows')?.name).toBe('MQS-Setup.exe')
    expect(pickInstaller(windows, 'mac')).toBeNull()
  })

  it('keeps each link below mqs/<channel>/ on the download host', () => {
    expect(installerUrl(file('mac', 'dmg', 'a.dmg'), 'test', 'mac')?.toString()).toBe('https://download.vanescience.com/mqs/test/a.dmg')
    expect(installerUrl({ ...file('mac', 'dmg', 'a.dmg'), url: '../stable/a.dmg' }, 'test', 'mac')).toBeNull()
    expect(installerUrl({ ...file('mac', 'dmg', 'a.dmg'), url: 'https://example.com/mqs/test/a.dmg' }, 'test', 'mac')).toBeNull()
    expect(installerUrl({ ...file('mac', 'dmg', 'a.dmg'), url: 'releases/0.1.0-test.11/a.dmg?x=1' }, 'test', 'mac')?.toString())
      .toBe('https://download.vanescience.com/mqs/test/releases/0.1.0-test.11/a.dmg')
  })

  it('refuses a manifest of another channel or form', () => {
    expect(parseManifest(manifest, 'test')).not.toBeNull()
    expect(parseManifest({ ...manifest, channel: 'stable' }, 'test')).toBeNull()
    expect(parseManifest({ ...manifest, files: [{ ...manifest.files[0], sha256: 'x' }] }, 'test')).toBeNull()
  })

  it('reads the manifest with a bearer token and never puts the token in the address', async () => {
    const config = downloadConfig({ MQS_DOWNLOAD_TOKEN_SIGNING_KEY: jwk, MQS_DOWNLOAD_CHANNEL: 'test' }, () => NOW)
    if (!config.ok) throw new Error('config')
    let seen: { url: string; auth: string | null } | undefined
    const fetcher = (async (url: string, init?: RequestInit) => {
      seen = { url, auth: new Headers(init?.headers).get('authorization') }
      return new Response(JSON.stringify(manifest), { status: 200 })
    }) as unknown as typeof fetch
    const result = await fetchManifest(config, 'mac', fetcher)
    expect(result.ok).toBe(true)
    expect(seen?.url).toBe('https://download.vanescience.com/mqs/test/manifest-mac.json')
    expect(seen?.auth).toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$/u)
  })
})

describe('visitor system', () => {
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
  const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  const headers = (values: Record<string, string>) => new Headers(values)

  it('reads the user agent first, then the platform hint', () => {
    expect(osFromRequestHeaders(headers({ 'user-agent': mac, 'sec-ch-ua-platform': '"Windows"' }))).toBe('mac')
    expect(osFromRequestHeaders(headers({ 'user-agent': windows }))).toBe('windows')
    expect(osFromRequestHeaders(headers({ 'user-agent': iphone }))).toBe('other')
    expect(osFromRequestHeaders(headers({ 'sec-ch-ua-platform': '"macOS"' }))).toBe('mac')
    expect(osFromRequestHeaders(headers({}))).toBe('other')
  })

  it('treats an iPad that tells it is a Mac as another system', () => {
    expect(osFromNavigator({ userAgent: mac, maxTouchPoints: 5 })).toBe('other')
    expect(osFromNavigator({ userAgent: mac, maxTouchPoints: 0 })).toBe('mac')
  })

  it('puts the system of the visitor first', () => {
    expect(downloadOrder('windows')).toEqual(['windows', 'mac'])
    expect(downloadOrder('mac')).toEqual(['mac', 'windows'])
    expect(downloadOrder('other')).toEqual(['mac', 'windows'])
  })
})
