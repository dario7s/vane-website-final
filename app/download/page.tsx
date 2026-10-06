import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { betaRobots } from '@/lib/beta-pages'
import { detectPlatform, parseRequestedOs } from '@/lib/platform'
import { loadReleaseManifest } from '@/lib/release-manifest'
import { getTutorialVideoUrl } from '@/lib/tutorial-video'
import { DownloadContent } from './download-content'

export const metadata: Metadata = {
  title: 'Download MQS',
  description: 'Download the MQS desktop app.',
  robots: betaRobots,
}

export default async function DownloadPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [manifestState, query, requestHeaders] = await Promise.all([
    loadReleaseManifest(),
    searchParams,
    headers(),
  ])

  // A first guess from request headers avoids a flash of the wrong button;
  // the client confirms with navigator.userAgentData / the user agent.
  const initialPlatform = detectPlatform({
    uaDataPlatform: requestHeaders.get('sec-ch-ua-platform'),
    userAgent: requestHeaders.get('user-agent'),
  })

  return (
    <DownloadContent
      manifestState={manifestState}
      requestedOs={parseRequestedOs(query.os)}
      initialPlatform={initialPlatform}
      tutorialVideoUrl={getTutorialVideoUrl()}
    />
  )
}
