'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useVisitorOs } from '@/lib/visitor-os-context'
import { OsIcon } from './os-icon'

/**
 * The "Download MQS" button: accent fill, the icon of the system of the visitor at the right of the text.
 * A visitor on another system (phone, Linux) gets the button without an icon. The download page shows both systems.
 */
export function DownloadMqsButton({ label, className, onClick }: { label: string; className?: string; onClick?: () => void }) {
  const os = useVisitorOs()
  return (
    <Link href="/download" onClick={onClick} data-download-cta="" className={cn("download-button download-button-primary", className)}>
      <span>{label}</span>
      {os !== 'other' && <OsIcon os={os} />}
    </Link>
  )
}
