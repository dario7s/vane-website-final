import { downloadConfig, fetchManifest } from '@/lib/download-store'
import { isDownloadOs } from '@/lib/visitor-os'

export const dynamic = 'force-dynamic'

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

/**
 * GET /api/download/<os>/manifest: the release manifest of the channel, byte for byte as the download host gives it.
 * The staging check compares the downloaded file with it. The Vercel login protects this route like each page.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ os: string }> }) {
  const { os } = await params
  if (!isDownloadOs(os)) return new Response('Not found\n', { status: 404, headers: HEADERS })
  const config = downloadConfig()
  if (!config.ok) return new Response('Downloads are not available right now.\n', { status: 503, headers: HEADERS })
  const result = await fetchManifest(config, os)
  if (!result.ok) return new Response(`${result.reason}\n`, { status: result.status === 404 ? 404 : 503, headers: HEADERS })
  return new Response(result.text, { status: 200, headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' } })
}
