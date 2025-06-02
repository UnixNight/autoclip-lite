import type { APIRoute } from 'astro'
import FFMPEG from 'fluent-ffmpeg'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import PQueue from 'p-queue'
import { z } from 'zod/v4'
import { TwitchCDNMasterPlaylist, TwitchCDNMediaPlaylist, TwitchCDNNauth } from '~/server/twitchapi'

export const GET: APIRoute = async (ctx) => {
  const schema = z.object({
    video: z.string().min(4),
    highlights: z
      .array(
        z.object({
          s: z.number(),
          e: z.number(),
        }),
      )
      .min(1),
  })

  const { video, highlights } = schema.parse(JSON.parse(ctx.url.searchParams.get('d') ?? ''))
  highlights.sort((a, b) => a.s - b.s)
  const hash = createHash('sha256')
    .update(JSON.stringify(highlights), 'utf8')
    .digest('base64')
    .replaceAll(/[^0-9a-zA-Z]/g, '')
    .slice(1, 9)

  const nauth = await TwitchCDNNauth(video)
  const playlistURL = await TwitchCDNMasterPlaylist(video, nauth)
  const segmentURLs = await TwitchCDNMediaPlaylist(playlistURL, highlights)
  const queue = new PQueue({ concurrency: 20 })
  const bodies = segmentURLs.map((url, idx) =>
    queue.add(
      async () => {
        const r = await fetch(url)
        return await r.arrayBuffer()
      },
      { throwOnTimeout: true, priority: -1 * idx },
    ),
  )

  return new Response(
    (ReadableStream as ReadableStreamExt).from(
      FFMPEG(Readable.from(concatStreams(bodies)))
        .videoCodec('copy')
        .audioCodec('copy')
        .addOption('-bsf:a', 'aac_adtstoasc')
        .format('mp4')
        .outputOptions('-movflags frag_keyframe+empty_moov')
        .on('error', console.error)
        .pipe(),
    ),
    {
      headers: {
        'content-type': 'video/mp4',
        'content-disposition': `attachment; filename="autoclip_${video}_${hash}.mp4"`,
      },
    },
  )
}

async function* concatStreams(buffers: Promise<ArrayBuffer>[]) {
  for await (const buf of buffers) {
    yield new Uint8Array(buf)
  }
}

type ReadableStreamExt = typeof ReadableStream & {
  from(asyncIterable: unknown): ReadableStream
}
