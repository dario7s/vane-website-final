import { downloadConfig, fetchManifest, installerUrl, pickInstaller } from '@/lib/download-store'
import { isDownloadOs } from '@/lib/visitor-os'

// Each answer is new: the token in the redirect lasts ten minutes.
export const dynamic = 'force-dynamic'

const HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' }

function plain(status: number, text: string) {
  return new Response(`${text}\n`, { status, headers: { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } })
}

/**
 * GET /api/download/mac or /api/download/windows: a 302 redirect to the installer on the download host, with a new
 * short token in `?t=`. The file bytes never go through this function. The query of the request has no effect.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ os: string }> }) {
  const { os } = await params
  if (!isDownloadOs(os)) return plain(404, 'Not found')
  const config = downloadConfig()
  if (!config.ok) return plain(503, 'Downloads are not available right now.')
  const result = await fetchManifest(config, os)
  if (!result.ok) return plain(result.status === 404 ? 404 : 503, 'Downloads are not available right now.')
  const file = pickInstaller(result.manifest, os)
  const target = file ? installerUrl(file, config.channel, os) : null
  if (!target) return plain(503, 'Downloads are not available right now.')
  target.searchParams.set('t', config.token())
  return new Response(null, { status: 302, headers: { ...HEADERS, Location: target.toString() } })
}
