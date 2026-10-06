import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseReleaseManifest, type ManifestState } from '@/lib/release-manifest'

const state = vi.hoisted(() => ({
  locale: 'en' as 'en' | 'de',
  waitlistProps: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({ locale: state.locale }),
}))
vi.mock('@/components/ui/audience-waitlist-form', () => ({
  AudienceWaitlistForm: (props: Record<string, unknown>) => {
    state.waitlistProps.push(props)
    return createElement('form', { 'data-testid': 'waitlist-form' })
  },
}))

const { DownloadContent, UNSIGNED_WARNINGS, WINDOWS_WAITLIST_SOURCE } = await import('./download-content')

const EXAMPLE_SHA = '50d858e0985ecc7f60418aaf0cc5ab587f42c2570a884095a9e8ccacd0f6545c'

function readyState(overrides: Record<string, unknown> = {}): ManifestState {
  const manifest = parseReleaseManifest({
    schemaVersion: 'mqs-release-manifest/1',
    product: 'MQS',
    channel: 'test',
    version: '0.0.0-example.1',
    releasedAt: '2026-10-06T12:00:00Z',
    signed: false,
    label: 'EXAMPLE manifest, not a real build',
    minimumOs: { mac: '12.0' },
    files: [
      { os: 'mac', arch: 'arm64', kind: 'dmg', name: 'MQS-example-arm64.dmg', url: 'MQS-example-arm64.dmg', bytes: 123_456_789, sha256: EXAMPLE_SHA },
    ],
    ...overrides,
  }, 'https://download.example.test/test/manifest.json')
  if (!manifest) throw new Error('fixture must be valid')
  return { state: 'ready', manifest }
}

function render(props: Partial<Parameters<typeof DownloadContent>[0]> = {}) {
  return renderToStaticMarkup(createElement(DownloadContent, {
    manifestState: { state: 'none' },
    requestedOs: null,
    initialPlatform: 'mac',
    tutorialVideoUrl: null,
    ...props,
  }))
}

beforeEach(() => {
  state.locale = 'en'
  state.waitlistProps = []
})

describe('download page: no release', () => {
  it.each([['en', 'No release published yet.'], ['de', 'Noch keine Version veröffentlicht.']] as const)(
    'shows the no-release state in %s and no download link',
    (locale, text) => {
      state.locale = locale
      const html = render()
      expect(html).toContain(text)
      expect(html).not.toContain('data-testid="primary-download"')
      expect(html).not.toContain('<video')
    },
  )
})

describe('download page: unsigned Mac test build', () => {
  it('shows the button, requirement, details, label and both fixed warnings', () => {
    const html = render({ manifestState: readyState() })
    expect(html).toContain('href="https://download.example.test/test/MQS-example-arm64.dmg"')
    expect(html).toContain('Download for Mac')
    expect(html).toContain('Apple Silicon (M1 or later) · macOS 12+')
    expect(html).toContain('0.0.0-example.1')
    expect(html).toContain('6 October 2026')
    expect(html).toContain('123 MB')
    expect(html).toContain(EXAMPLE_SHA)
    expect(html).toContain('Copy')
    expect(html).toContain('EXAMPLE manifest, not a real build')
    expect(html).toContain('Unsigned test build, not for coaches')
    expect(html).toContain('Do not open on a Mac that holds MQS data')
    expect(html).toContain('Windows · Coming soon')
    expect(state.waitlistProps).toHaveLength(0)
  })

  it('omits the macOS version when the manifest gives none', () => {
    const html = render({ manifestState: readyState({ minimumOs: {} }) })
    expect(html).toContain('Apple Silicon (M1 or later)')
    expect(html).not.toContain('macOS')
  })

  it('shows the fixed warning once when the label repeats it', () => {
    const html = render({ manifestState: readyState({ label: UNSIGNED_WARNINGS.en[0] }) })
    expect(html.split(UNSIGNED_WARNINGS.en[0])).toHaveLength(2)
  })

  it('shows no warnings for a signed build', () => {
    const html = render({ manifestState: readyState({ signed: true, label: '' }) })
    expect(html).not.toContain('Unsigned test build')
    expect(html).not.toContain('Do not open on a Mac')
  })

  it('tells phone visitors to open the page on a computer', () => {
    const html = render({ manifestState: readyState(), initialPlatform: 'mobile' })
    expect(html).toContain('Open this page on your computer')
    expect(html).toContain('Download for Mac')
  })

  it('renders the tutorial video only when a URL is configured', () => {
    expect(render({ manifestState: readyState() })).not.toContain('<video')
    const html = render({ manifestState: readyState(), tutorialVideoUrl: 'https://download.example.test/getting-started.mp4' })
    expect(html).toContain('<video')
    expect(html).toContain('src="https://download.example.test/getting-started.mp4"')
    expect(html).toContain('Getting started')
  })

  it('formats file sizes from bytes to megabytes', async () => {
    const { formatBytes } = await import('./download-content')
    expect(formatBytes(7, 'en')).toBe('7 B')
    expect(formatBytes(48_200, 'en')).toBe('48 KB')
    expect(formatBytes(4_250_000, 'de')).toBe('4,3 MB')
    expect(formatBytes(123_456_789, 'en')).toBe('123 MB')
  })

  it('says when the manifest has no Mac file', () => {
    const html = render({ manifestState: readyState({
      files: [{ os: 'windows', arch: 'x64', kind: 'nsis', name: 'MQS-example.exe', url: 'MQS-example.exe', bytes: 1, sha256: EXAMPLE_SHA }],
    }) })
    expect(html).toContain('No Mac release published yet.')
    expect(html).not.toContain('data-testid="primary-download"')
  })
})

describe('download page: Windows detected', () => {
  it.each([
    ['detected from the browser', { initialPlatform: 'windows' as const }],
    ['requested with ?os=windows', { initialPlatform: 'mac' as const, requestedOs: 'windows' as const }],
  ])('shows coming soon with the coach waitlist form (%s)', (_case, props) => {
    const html = render({ manifestState: readyState(), ...props })
    expect(html).toContain('MQS for Windows')
    expect(html).toContain('Coming soon.')
    expect(html).toContain('data-testid="waitlist-form"')
    expect(html).not.toContain('data-testid="primary-download"')
    expect(html).toContain('href="/download?os=mac"')
    expect(state.waitlistProps).toHaveLength(1)
    expect(state.waitlistProps[0]).toMatchObject({ audience: 'coach', source: WINDOWS_WAITLIST_SOURCE, locale: 'en' })
  })

  it('uses a waitlist source the signup schema accepts', async () => {
    const { parseWaitlistInput } = await import('@/lib/waitlist-schema')
    expect(parseWaitlistInput({ email: 'name@example.com', segment: 'coach', source: WINDOWS_WAITLIST_SOURCE }).success).toBe(true)
  })
})
