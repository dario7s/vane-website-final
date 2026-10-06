'use client'

import { PlaceholderContent } from '@/components/ui/placeholder-content'

/**
 * Inactive slots. "Manage subscription" will open the payment provider's
 * customer portal; the withdrawal and cancellation buttons are the consumer-law
 * buttons of research §3.2 (§13a FAGG, §356a and §312k BGB). Their final
 * wording and behaviour need counsel's approval before they are switched on.
 */
export const accountCopy = {
  title: { en: 'Your account', de: 'Dein Konto' },
  lines: {
    en: ['Account management is not active yet.'],
    de: ['Die Kontoverwaltung ist noch nicht aktiv.'],
  },
  inactive: { en: 'Not active yet', de: 'Noch nicht aktiv' },
  slots: [
    { id: 'customer-portal', en: 'Manage subscription', de: 'Abo verwalten' },
    { id: 'withdrawal', en: 'Withdraw from contract', de: 'Vertrag widerrufen' },
    { id: 'cancellation', en: 'Cancel contract', de: 'Verträge hier kündigen' },
  ],
} as const

export function AccountContent() {
  return (
    <PlaceholderContent title={accountCopy.title} lines={accountCopy.lines}>
      {(locale) => (
        <ul className="mt-8 space-y-3">
          {accountCopy.slots.map((slot) => (
            <li key={slot.id} data-slot={slot.id} className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled
                aria-describedby={`${slot.id}-state`}
                className="inline-flex min-h-12 cursor-not-allowed items-center justify-center rounded-full border border-white/[0.18] px-6 py-3 text-sm font-medium text-muted-foreground opacity-60"
              >
                {slot[locale]}
              </button>
              <span id={`${slot.id}-state`} className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {accountCopy.inactive[locale]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PlaceholderContent>
  )
}
