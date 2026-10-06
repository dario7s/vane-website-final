'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PlaceholderContent } from '@/components/ui/placeholder-content'

export const pricingCopy = {
  title: { en: 'Pricing', de: 'Preise' },
  lines: {
    en: ['Plans and prices are coming soon.', 'Join the coach waitlist and we will contact you when access is available.'],
    de: ['Pläne und Preise folgen in Kürze.', 'Trag dich auf die Coach Warteliste ein. Wir melden uns, sobald der Zugang verfügbar ist.'],
  },
  cta: { en: 'Join the waitlist', de: 'Auf die Warteliste' },
} as const

export function PricingContent() {
  return (
    <PlaceholderContent title={pricingCopy.title} lines={pricingCopy.lines}>
      {(locale) => (
        <Link
          href="/for/coach#waitlist"
          className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {pricingCopy.cta[locale]}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </PlaceholderContent>
  )
}
