import { initTRPC } from '@trpc/server'
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch'
import { z } from 'zod/v4'
import { transformer } from './trpc.transformer'
import {
  TwitchSetIntegrity,
  TwitchUserThirdPartyEmotes,
  TwitchVideoCommentsInternal,
  TwitchVideoMetadataInternal,
} from './twitchapi'

export function createContextFactory() {
  return async ({ req, resHeaders }: FetchCreateContextFnOptions) => {
    return { req, resHeaders }
  }
}

export type Context = Awaited<ReturnType<Awaited<ReturnType<typeof createContextFactory>>>>

const t = initTRPC.context<Context>().create({
  transformer,
})

export const appRouter = t.router({
  video: t.procedure.input(z.string()).query(async ({ ctx, input }) => {
    await TwitchSetIntegrity()
    const metadata = await TwitchVideoMetadataInternal(input)
    if (!metadata) {
      throw new Error('failure to load video metadata')
    }

    const emoteMap = await TwitchUserThirdPartyEmotes(metadata.owner.id)

    const parallelizationFactor = 10 // Adjust this as you like. Higher numbers load faster but can waste resources for shorter videos.
    const checkpoints = new Array(parallelizationFactor)
      .fill(0)
      .map((_, idx) => Math.floor((idx * metadata.lengthSeconds) / parallelizationFactor))
    const edges = await Promise.all(
      checkpoints.map(async (start, i, a) => {
        const end = (a[i + 1] ?? 72 * 60 * 60) + 5 // End 5 seconds after the next chunk starts, or at 72 hours (max length of a stream)

        let r = await TwitchVideoCommentsInternal(input, 'contentOffsetSeconds', start)
        if (!r) {
          throw new Error('failure to load comments')
        }
        let ret = r.edges
        if ((r.edges.at(-1)?.node.contentOffsetSeconds ?? 0) > end) {
          return ret
        }

        while (r.pageInfo.hasNextPage && r.edges.at(-1)?.cursor) {
          r = await TwitchVideoCommentsInternal(input, 'cursor', r.edges.at(-1)?.cursor)
          if (!r) {
            throw new Error('failure to load comments')
          }
          ret.push(...r.edges)
          if ((r.edges.at(-1)?.node.contentOffsetSeconds ?? 0) > end) {
            return ret
          }
        }

        return ret
      }),
    )

    const comments = new Map(edges.flat().map((e) => [e.node.id, e.node]))
    const lines = Array.from(comments.values()).map((c) => {
      const emotes = []
      for (const e of c.message.fragments) {
        if (e.emote?.emoteID) {
          emotes.push({
            id: e.emote.emoteID,
            text: e.text,
            source: 'twitch' as const,
          })
        } else {
          for (const w of e.text.split(' ')) {
            const v = emoteMap.get(w)
            if (v) {
              emotes.push(v)
            }
          }
        }
      }

      const text = c.message.fragments.map((e) => e.text).join('')
      return {
        id: c.id,
        offset: c.contentOffsetSeconds,
        commenterID: c.commenter?.id,
        commenterName: c.commenter?.displayName,
        text,
        emotes,
      }
    })

    const maxAge = metadata.status.toLowerCase() === 'recorded' ? 7 * 24 * 60 * 60 : 15 * 60
    ctx.resHeaders.set('Cache-Control', `public, max-age=${maxAge}`)
    return {
      id: input,
      status: metadata.status,
      lines,
    }
  }),
})

export type AppRouter = typeof appRouter
