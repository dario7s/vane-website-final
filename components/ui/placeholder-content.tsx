'use client'

import type { ReactNode } from 'react'
import { useLocale, type Locale } from '@/lib/locale'
import { Section } from '@/components/ui/section'
import { Container } from '@/components/ui/container'
import { H1 } from '@/components/ui/typography'

/** Shared frame for the beta placeholder pages (pricing, account, legal slots). */
export function PlaceholderContent({
  title,
  lines,
  children,
}: {
  title: Record<Locale, string>
  lines: Record<Locale, readonly string[]>
  children?: (locale: Locale) => ReactNode
}) {
  const { locale } = useLocale()
  return (
    <Section spacing="xl">
      <Container size="sm">
        <H1>{title[locale]}</H1>
        <div className="mt-8 space-y-3">
          {lines[locale].map((line) => (
            <p key={line} className="text-lg leading-relaxed text-foreground">{line}</p>
          ))}
        </div>
        {children?.(locale)}
        <p className="mt-10 text-sm text-muted-foreground">
          {locale === 'de' ? 'Fragen:' : 'Questions:'}{' '}
          <a
            href="mailto:mqs@vanescience.com"
            className="underline decoration-white/30 underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            mqs@vanescience.com
          </a>
        </p>
      </Container>
    </Section>
  )
}
