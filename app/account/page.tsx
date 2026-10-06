import type { Metadata } from 'next'
import { betaRobots } from '@/lib/beta-pages'
import { AccountContent } from './account-content'

export const metadata: Metadata = {
  title: 'Account',
  description: 'MQS account management is not active yet.',
  robots: betaRobots,
}

export default function AccountPage() {
  return <AccountContent />
}
