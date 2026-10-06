'use client'

import { PlaceholderContent } from '@/components/ui/placeholder-content'

/** Slot only: the lawyer-approved text replaces this. No legal wording here. */
export const legalSlotLines = {
  en: ['This text is being prepared.'],
  de: ['Dieser Text wird gerade vorbereitet.'],
} as const

export const legalSlotTitles = {
  'subscription-terms': { en: 'Subscription terms', de: 'Abonnementbedingungen' },
  refunds: { en: 'Refunds', de: 'Rückerstattungen' },
  'app-privacy': { en: 'App privacy', de: 'Datenschutz in der App' },
} as const

export type LegalSlotId = keyof typeof legalSlotTitles

export function LegalSlot({ slot }: { slot: LegalSlotId }) {
  return <PlaceholderContent title={legalSlotTitles[slot]} lines={legalSlotLines} />
}
