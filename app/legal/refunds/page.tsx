import type { Metadata } from 'next'
import { betaRobots } from '@/lib/beta-pages'
import { LegalSlot } from '../legal-slot'

export const metadata: Metadata = {
  title: 'Refunds',
  description: 'This text is being prepared.',
  robots: betaRobots,
}

export default function RefundsPage() {
  return <LegalSlot slot="refunds" />
}
