'use client'

import { Container } from '@/components/ui/container'
import { AudienceEyebrow } from '@/components/ui/audience-primitives'
import { OsIcon, OS_NAMES } from '@/components/ui/os-icon'
import { trackEvent } from '@/lib/analytics'
import type { DownloadInfo } from '@/lib/download-store'
import { useLocale, type Locale } from '@/lib/locale'
import { downloadOrder, type DownloadOs } from '@/lib/visitor-os'
import { useVisitorOs } from '@/lib/visitor-os-context'
import { cn } from '@/lib/utils'

// First draft of the visitor text. English is the source (American spelling).
const copy = {
  en: {
    eyebrow: 'MQS Desktop · Test build',
    title: 'Downloads',
    intro:
      'MQS Desktop is the app for coaches: record or import your athletes’ assessments, get the Movement Quality Score across seven domains, and build the report. This is a test build for early testing. It is not the finished product.',
    button: (os: DownloadOs) => `Download for ${OS_NAMES[os]}`,
    version: (version: string, size: string) => `Version ${version} · ${size}`,
    missing: 'Not available right now',
    unavailable: 'Downloads are not available right now.',
    otherSystem: 'MQS Desktop runs on macOS and Windows. Open this page on your Mac or PC to download it.',
    requirementsTitle: 'System requirements',
    requirements: {
      mac: 'macOS on a Mac with Apple silicon (M1 or newer).',
      windows: 'Windows 10 or 11, 64-bit (x64).',
    },
    installTitle: 'Installing the test build',
    install: {
      mac: 'Open the downloaded disk image and drag MQS into your Applications folder. Test builds are not signed yet, so macOS may block the first start. If it does, open System Settings › Privacy & Security and choose Open Anyway.',
      windows: 'Run the downloaded installer. Test builds are not signed yet, so Windows may show a SmartScreen warning. Choose More info, then Run anyway.',
    },
  },
  de: {
    eyebrow: 'MQS Desktop · Testbuild',
    title: 'Downloads',
    intro:
      'MQS Desktop ist die App für Coaches: Assessments deiner Athleten aufnehmen oder importieren, den Movement Quality Score über sieben Domänen erhalten und den Bericht erstellen. Dies ist ein Testbuild für frühe Tests. Es ist nicht das fertige Produkt.',
    button: (os: DownloadOs) => `Für ${OS_NAMES[os]} herunterladen`,
    version: (version: string, size: string) => `Version ${version} · ${size}`,
    missing: 'Derzeit nicht verfügbar',
    unavailable: 'Downloads sind derzeit nicht verfügbar.',
    otherSystem: 'MQS Desktop läuft auf macOS und Windows. Öffne diese Seite auf deinem Mac oder PC, um es herunterzuladen.',
    requirementsTitle: 'Systemvoraussetzungen',
    requirements: {
      mac: 'macOS auf einem Mac mit Apple Silicon (M1 oder neuer).',
      windows: 'Windows 10 oder 11, 64 Bit (x64).',
    },
    installTitle: 'Testbuild installieren',
    install: {
      mac: 'Öffne das geladene Disk-Image und ziehe MQS in den Ordner Programme. Testbuilds sind noch nicht signiert, daher kann macOS den ersten Start blockieren. Öffne dann Systemeinstellungen › Datenschutz & Sicherheit und wähle Trotzdem öffnen.',
      windows: 'Starte das geladene Installationsprogramm. Testbuilds sind noch nicht signiert, daher kann Windows eine SmartScreen-Warnung zeigen. Wähle Weitere Informationen und dann Trotzdem ausführen.',
    },
  },
}

function formatSize(bytes: number, locale: Locale) {
  const megabytes = bytes / 1048576
  return `${megabytes.toLocaleString(locale === 'de' ? 'de-AT' : 'en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`
}

export function DownloadContent({ builds }: { builds: DownloadInfo[] }) {
  const { locale } = useLocale()
  const text = copy[locale]
  const visitorOs = useVisitorOs()
  const order = downloadOrder(visitorOs)
  const byOs = new Map(builds.map((build) => [build.os, build]))
  const anyAvailable = builds.some((build) => build.version !== null)

  return (
    <section className="relative overflow-hidden bg-background pb-24 pt-16 md:pb-32 md:pt-24">
      <Container size="md">
        <AudienceEyebrow>{text.eyebrow}</AudienceEyebrow>
        <h1 className="mt-4 font-display text-6xl font-bold uppercase leading-[0.96] tracking-[0.02em] text-foreground md:text-8xl">
          {text.title}
        </h1>
        <p className="mt-6 max-w-[62ch] text-base leading-[1.6] text-muted-foreground md:text-[17px]">{text.intro}</p>

        {!anyAvailable && <p role="status" className="mt-6 text-sm text-[var(--mqs-accent)]">{text.unavailable}</p>}
        {visitorOs === 'other' && <p className="mt-6 max-w-[62ch] text-sm text-white/80">{text.otherSystem}</p>}

        <div className="mt-10 flex flex-col items-start gap-6 sm:flex-row sm:flex-wrap">
          {order.map((os, index) => {
            const build = byOs.get(os)
            const primary = index === 0 && visitorOs !== 'other'
            return (
              <div key={os} className="flex flex-col items-start gap-2.5">
                <a
                  href={`/api/download/${os}`}
                  data-download-os={os}
                  onClick={() => trackEvent('cta_click', { location: primary ? 'download_primary' : 'download_secondary', audience: os })}
                  className={cn('download-button', primary ? 'download-button-primary' : 'download-button-secondary')}
                >
                  <span>{text.button(os)}</span>
                  <OsIcon os={os} />
                </a>
                <p className="pl-1 font-mono text-xs text-white/55">
                  {build && build.version !== null ? text.version(build.version, formatSize(build.bytes, locale)) : text.missing}
                </p>
              </div>
            )
          })}
        </div>

        <div className="mt-16 grid gap-10 border-t border-white/10 pt-10 md:grid-cols-2 md:gap-14">
          <div>
            <h2 className="font-sans text-[13px] font-semibold uppercase tracking-[0.08em] text-white/70">{text.requirementsTitle}</h2>
            <ul className="mt-4 space-y-3">
              {order.map((os) => (
                <li key={os} className="flex items-start gap-3 text-[15px] leading-[1.55] text-foreground">
                  <OsIcon os={os} className="mt-[3px] text-white/60" />
                  <p>{text.requirements[os]}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-sans text-[13px] font-semibold uppercase tracking-[0.08em] text-white/70">{text.installTitle}</h2>
            <ul className="mt-4 space-y-4">
              {order.map((os) => (
                <li key={os} className="flex items-start gap-3 text-[15px] leading-[1.6] text-muted-foreground">
                  <OsIcon os={os} className="mt-[4px] text-white/60" />
                  <p>{text.install[os]}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  )
}
