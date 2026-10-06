import { resolveManifestUrl } from './release-manifest'

/**
 * Tutorial-video hosting slot (capability X-14). `MQS_TUTORIAL_VIDEO_URL`
 * points at a video file (e.g. an MP4 on the download domain). Unset or
 * unusable values return null and the slot renders nothing.
 */
export function getTutorialVideoUrl(value: string | undefined = process.env.MQS_TUTORIAL_VIDEO_URL): string | null {
  const url = value?.trim()
  if (!url) return null
  return resolveManifestUrl(url, url)
}
