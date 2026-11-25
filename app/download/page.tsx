import type { Metadata } from 'next'
import { downloadInfo } from '@/lib/download-store'
import { DOWNLOAD_OSES } from '@/lib/visitor-os'
import { DownloadContent } from './download-content'

export const metadata: Metadata = {
  title: { absolute: 'Downloads | VANE Science' },
  description: 'Download the MQS Desktop test build for macOS and Windows.',
  robots: { index: false, follow: false },
}

// The page reads the current manifests on each request.
export const dynamic = 'force-dynamic'

export default async function DownloadPage() {
  const builds = await Promise.all(DOWNLOAD_OSES.map((os) => downloadInfo(os)))
  return <DownloadContent builds={builds} />
}
