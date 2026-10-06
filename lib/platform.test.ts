import { describe, expect, it } from 'vitest'
import { detectPlatform, parseRequestedOs, primaryDownloadOs } from './platform'

const UA = {
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
}

describe('detectPlatform', () => {
  it('prefers navigator.userAgentData.platform', () => {
    expect(detectPlatform({ uaDataPlatform: 'Windows', userAgent: UA.mac })).toBe('windows')
    expect(detectPlatform({ uaDataPlatform: 'macOS', userAgent: UA.windows })).toBe('mac')
    expect(detectPlatform({ uaDataPlatform: 'Android' })).toBe('mobile')
    expect(detectPlatform({ uaDataPlatform: 'Linux' })).toBe('other')
  })

  it('reads the quoted Sec-CH-UA-Platform header form', () => {
    expect(detectPlatform({ uaDataPlatform: '"Windows"' })).toBe('windows')
    expect(detectPlatform({ uaDataPlatform: '"macOS"' })).toBe('mac')
  })

  it('falls back to the user agent', () => {
    expect(detectPlatform({ uaDataPlatform: '', userAgent: UA.mac })).toBe('mac')
    expect(detectPlatform({ userAgent: UA.windows })).toBe('windows')
    expect(detectPlatform({ userAgent: UA.iphone })).toBe('mobile')
    expect(detectPlatform({ userAgent: UA.android })).toBe('mobile')
    expect(detectPlatform({ userAgent: UA.linux })).toBe('other')
    expect(detectPlatform({})).toBe('unknown')
  })

  it('treats a touch-screen "Mac" (iPadOS Safari) as mobile', () => {
    expect(detectPlatform({ userAgent: UA.mac, maxTouchPoints: 5 })).toBe('mobile')
    expect(detectPlatform({ userAgent: UA.mac, maxTouchPoints: 0 })).toBe('mac')
  })
})

describe('primary download', () => {
  it('offers Windows only to Windows visitors and Mac otherwise', () => {
    expect(primaryDownloadOs(null, 'windows')).toBe('windows')
    for (const platform of ['mac', 'mobile', 'other', 'unknown'] as const) {
      expect(primaryDownloadOs(null, platform)).toBe('mac')
    }
  })

  it('lets ?os= override detection and ignores other values', () => {
    expect(primaryDownloadOs(parseRequestedOs('windows'), 'mac')).toBe('windows')
    expect(primaryDownloadOs(parseRequestedOs(['mac']), 'windows')).toBe('mac')
    expect(parseRequestedOs('linux')).toBeNull()
    expect(parseRequestedOs(undefined)).toBeNull()
  })
})
