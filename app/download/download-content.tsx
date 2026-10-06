'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, Copy, Download } from 'lucide-react'
import { useLocale, type Locale } from '@/lib/locale'
import { Section } from '@/components/ui/section'
import { Container } from '@/components/ui/container'
import { H1 } from '@/components/ui/typography'
import { AudienceWaitlistForm } from '@/components/ui/audience-waitlist-form'
import { TutorialVideo } from '@/components/ui/tutorial-video'
import { audienceContent } from '@/lib/audience-content'
import {
  detectPlatform,
  primaryDownloadOs,
  type DownloadOs,
  type Platform,
} from '@/lib/platform'
import {
  macOsMajor,
  pickMacFile,
  type ManifestState,
  type ReleaseFile,
  type ReleaseManifest,
} from '@/lib/release-manifest'

/** Brevo source for the Windows waitlist (lib/waitlist-schema.ts allows 120 characters). */
export const WINDOWS_WAITLIST_SOURCE = 'Windows'

/** Fixed warnings for any build whose manifest says `signed: false`. */
export const UNSIGNED_WARNINGS = {
  en: ['Unsigned test build, not for coaches', 'Do not open on a Mac that holds MQS data'],
  de: ['Unsignierter Test Build, nicht für Coaches', 'Nicht auf einem Mac öffnen, auf dem MQS Daten liegen'],
} as const

const copy = {
  en: {
    title: 'Download MQS',
    noRelease: 'No release published yet.',
    questions: 'Questions:',
    downloadMac: 'Download for Mac',
    appleSilicon: 'Apple Silicon (M1 or later)',
    intel: 'Intel',
    noMacFile: 'No Mac release published yet.',
    mobile: 'MQS runs on a Mac. Open this page on your computer to download it.',
    version: 'Version',
    released: 'Released',
    size: 'File size',
    checksum: 'SHA-256',
    copyChecksum: 'Copy',
    copied: 'Copied',
    releaseNotes: 'Release notes',
    windowsTitle: 'MQS for Windows',
    windowsText: 'Coming soon. Join the waitlist and we will email you when it is ready.',
    otherPlatforms: 'Other platforms',
    comingSoon: 'Coming soon',
    tutorialTitle: 'Getting started',
  },
  de: {
    title: 'MQS herunterladen',
    noRelease: 'Noch keine Version veröffentlicht.',
    questions: 'Fragen:',
    downloadMac: 'Für Mac herunterladen',
    appleSilicon: 'Apple Silicon (M1 oder neuer)',
    intel: 'Intel',
    noMacFile: 'Noch keine Mac Version veröffentlicht.',
    mobile: 'MQS läuft auf dem Mac. Öffne diese Seite auf deinem Computer, um es herunterzuladen.',
    version: 'Version',
    released: 'Veröffentlicht',
    size: 'Dateigröße',
    checksum: 'SHA-256',
    copyChecksum: 'Kopieren',
    copied: 'Kopiert',
    releaseNotes: 'Versionshinweise',
    windowsTitle: 'MQS für Windows',
    windowsText: 'Bald verfügbar. Trag dich auf die Warteliste ein und wir schreiben dir, sobald es so weit ist.',
    otherPlatforms: 'Andere Plattformen',
    comingSoon: 'Bald verfügbar',
    tutorialTitle: 'Erste Schritte',
  },
} as const

type Copy = (typeof copy)[Locale]

const subscribeNever = () => () => {}

function readBrowserPlatform(): Platform {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  return detectPlatform({
    uaDataPlatform: nav.userAgentData?.platform,
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints,
  })
}

/** Server: the request-header guess. Browser: navigator.userAgentData, else the user agent. */
function useBrowserPlatform(initialPlatform: Platform): Platform {
  return useSyncExternalStore(subscribeNever, readBrowserPlatform, () => initialPlatform)
}

export function formatBytes(bytes: number, locale: Locale): string {
  const format = (value: number, digits: number) =>
    new Intl.NumberFormat(locale === 'de' ? 'de-AT' : 'en-GB', { maximumFractionDigits: digits }).format(value)
  if (bytes < 1_000) return `${format(bytes, 0)} B`
  if (bytes < 1_000_000) return `${format(bytes / 1_000, 0)} KB`
  const megabytes = bytes / 1_000_000
  return `${format(megabytes, megabytes < 10 ? 1 : 0)} MB`
}

export function formatReleaseDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-AT' : 'en-GB', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(iso))
}

const buttonClass =
  'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
const cardClass = 'rounded-2xl border border-white/[0.12] bg-card/60 p-5 md:p-8'
const linkClass =
  'underline decoration-white/30 underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70'

export function DownloadContent({
  manifestState,
  requestedOs,
  initialPlatform,
  tutorialVideoUrl,
}: {
  manifestState: ManifestState
  requestedOs: DownloadOs | null
  initialPlatform: Platform
  tutorialVideoUrl: string | null
}) {
  const { locale } = useLocale()
  const t = copy[locale]
  const platform = useBrowserPlatform(initialPlatform)

  if (manifestState.state === 'none') {
    return (
      <Section spacing="xl">
        <Container size="sm">
          <H1>{t.title}</H1>
          <p role="status" className="mt-8 text-lg leading-relaxed text-foreground">{t.noRelease}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            {t.questions}{' '}
            <a href="mailto:mqs@vanescience.com" className={linkClass}>mqs@vanescience.com</a>
          </p>
        </Container>
      </Section>
    )
  }

  const { manifest } = manifestState
  const primary = primaryDownloadOs(requestedOs, platform)
  const others: DownloadOs[] = primary === 'mac' ? ['windows'] : ['mac']

  return (
    <Section spacing="xl">
      <Container size="sm">
        <H1>{t.title}</H1>
        {platform === 'mobile' && !requestedOs && (
          <p className="mt-6 text-base leading-relaxed text-muted-foreground">{t.mobile}</p>
        )}

        <div className="mt-8">
          {primary === 'mac'
            ? <MacPanel manifest={manifest} locale={locale} t={t} />
            : <WindowsPanel locale={locale} t={t} />}
        </div>

        <nav aria-labelledby="other-platforms" className="mt-10 border-t border-white/[0.1] pt-6">
          <h2 id="other-platforms" className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t.otherPlatforms}
          </h2>
          <ul className="mt-3 space-y-2 text-base">
            {others.map((os) => (
              <li key={os}>
                <Link href={`/download?os=${os}`} className={linkClass}>
                  {os === 'mac' ? t.downloadMac : `Windows · ${t.comingSoon}`}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <TutorialVideo url={tutorialVideoUrl} title={t.tutorialTitle} />
      </Container>
    </Section>
  )
}

function MacPanel({ manifest, locale, t }: { manifest: ReleaseManifest; locale: Locale; t: Copy }) {
  const file = pickMacFile(manifest)
  if (!file) {
    return <div className={cardClass}><p role="status" className="text-lg">{t.noMacFile}</p></div>
  }

  const major = macOsMajor(manifest.minimumOs.mac) ?? '12'
  const requirement = `${file.arch === 'arm64' ? t.appleSilicon : t.intel} · macOS ${major}+`

  return (
    <div className={cardClass}>
      {!manifest.signed && <UnsignedWarning label={manifest.label} locale={locale} />}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <a href={file.url} className={buttonClass} data-testid="primary-download">
          <Download className="h-4 w-4" aria-hidden="true" />
          {t.downloadMac}
        </a>
        <p className="text-sm text-muted-foreground">{requirement}</p>
      </div>

      <FileDetails manifest={manifest} file={file} locale={locale} t={t} />
    </div>
  )
}

function UnsignedWarning({ label, locale }: { label: string; locale: Locale }) {
  const warnings = UNSIGNED_WARNINGS[locale]
  const trimmed = label.trim()
  // The release script may write the first fixed warning as its label; show it once.
  const showLabel = trimmed !== '' && !(UNSIGNED_WARNINGS.en as readonly string[]).includes(trimmed)
    && !(UNSIGNED_WARNINGS.de as readonly string[]).includes(trimmed)

  return (
    <div role="note" className="mb-6 flex gap-3 rounded-xl border border-amber-300/40 bg-amber-950/30 p-4 text-amber-100">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
      <div className="space-y-1.5">
        {showLabel && <p className="text-base font-semibold" data-testid="manifest-label">{trimmed}</p>}
        <p className="text-base font-semibold">{warnings[0]}</p>
        <p className="text-sm">{warnings[1]}</p>
      </div>
    </div>
  )
}

function FileDetails({ manifest, file, locale, t }: { manifest: ReleaseManifest; file: ReleaseFile; locale: Locale; t: Copy }) {
  return (
    <dl className="mt-8 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-muted-foreground">{t.version}</dt>
        <dd className="mt-1 font-mono text-foreground">{manifest.version}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t.released}</dt>
        <dd className="mt-1 text-foreground">
          <time dateTime={manifest.releasedAt}>{formatReleaseDate(manifest.releasedAt, locale)}</time>
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t.size}</dt>
        <dd className="mt-1 text-foreground">{formatBytes(file.bytes, locale)}</dd>
      </div>
      <div className="sm:col-span-3">
        <dt className="text-muted-foreground">{t.checksum} <span className="text-muted-foreground/70">({file.name})</span></dt>
        <dd className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
          <code className="select-all break-all font-mono text-xs leading-relaxed text-foreground">{file.sha256}</code>
          <CopyButton value={file.sha256} label={t.copyChecksum} doneLabel={t.copied} />
        </dd>
      </div>
      {manifest.releaseNotesUrl && (
        <div className="sm:col-span-3">
          <dd>
            <a href={manifest.releaseNotesUrl} className={linkClass} rel="noopener noreferrer">{t.releaseNotes}</a>
          </dd>
        </div>
      )}
    </dl>
  )
}

function CopyButton({ value, label, doneLabel }: { value: string; label: string; doneLabel: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused; the checksum stays selectable.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 self-start rounded-full border border-white/[0.18] px-4 text-xs font-medium text-foreground transition-colors hover:border-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      <span aria-live="polite">{copied ? doneLabel : label}</span>
    </button>
  )
}

function WindowsPanel({ locale, t }: { locale: Locale; t: Copy }) {
  const coach = audienceContent.coach[locale]
  return (
    <div className={cardClass}>
      <h2 className="text-xl font-semibold text-foreground md:text-2xl">{t.windowsTitle}</h2>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">{t.windowsText}</p>
      <AudienceWaitlistForm
        audience="coach"
        locale={locale}
        cta={coach.finalCta}
        note={coach.finalNote}
        source={WINDOWS_WAITLIST_SOURCE}
      />
    </div>
  )
}
