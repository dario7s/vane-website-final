import type { Metadata } from 'next'
import { betaRobots } from '@/lib/beta-pages'
import { PricingContent } from './pricing-content'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'MQS plans and prices are coming soon.',
  robots: betaRobots,
}

export default function PricingPage() {
  return <PricingContent />
}
