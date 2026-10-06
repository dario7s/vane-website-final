/**
 * Tutorial-video hosting slot (capability X-14). Renders the video only when
 * a URL is configured (`MQS_TUTORIAL_VIDEO_URL`, validated in
 * `lib/tutorial-video.ts`); otherwise it renders nothing.
 */
export function TutorialVideo({ url, title }: { url: string | null; title: string }) {
  if (!url) return null

  return (
    <section aria-labelledby="tutorial-video" className="mt-12" data-testid="tutorial-video">
      <h2 id="tutorial-video" className="text-xl font-semibold text-foreground md:text-2xl">{title}</h2>
      <video
        src={url}
        controls
        playsInline
        preload="metadata"
        className="mt-4 aspect-video w-full rounded-2xl border border-white/[0.12] bg-black"
      />
    </section>
  )
}
