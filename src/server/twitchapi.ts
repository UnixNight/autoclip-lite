import { Temporal } from '@js-temporal/polyfill'
import { TWITCH_ID, TWITCH_SECRET } from 'astro:env/server'
import { type ZodType, z } from 'zod/v4'
import { zDurationString, zTemporalString } from './zod'

const errorSchema = z.object({
  error: z.string().optional(),
  status: z.number(),
  message: z.string(),
})

async function apiFetch<T extends ZodType>(
  fetcher: Promise<Response>,
  schema: T,
): Promise<z.infer<T>> {
  const resp = await fetcher
  const data = await resp.json()
  const err = errorSchema.safeParse(data)
  if (err.success) {
    throw new Error(
      `invalid response from twitch: ${err.data.error} (${err.data.status}): ${err.data.message}`,
    )
  }
  if (!resp.ok) {
    throw new Error(`invalid response from twitch: status ${resp.status}`)
  }

  const r = schema.safeParse(data)
  if (!r.success) {
    throw new Error(
      `invalid data shape from twitch: ${r.error}\n\n${JSON.stringify(data, null, 2)}`,
    )
  }

  return r.data
}

const cache = new Map<string, { r: Response; e: Temporal.Instant }>()
async function cachedFetch(url: string | URL | globalThis.Request, opts?: RequestInit) {
  const now = Temporal.Now.instant()
  const k = JSON.stringify({ url, opts })
  const v = cache.get(k)
  if (v && Temporal.Instant.compare(now, v.e) === -1) {
    return v.r.clone()
  }

  const r = await fetch(url, opts)
  if (r.status >= 200 && r.status < 300) {
    // Cache successful requests for 15 minutes
    cache.set(k, { r: r.clone(), e: now.add({ minutes: 15 }) })
  }
  return r
}

let appTokenCache: undefined | { token: string; expiresAt: Temporal.Instant } = undefined
async function appToken() {
  const now = Temporal.Now.instant()
  if (appTokenCache && Temporal.Instant.compare(now, appTokenCache.expiresAt) === -1) {
    return appTokenCache.token
  }

  const { access_token, expires_in } = await apiFetch(
    fetch(`https://id.twitch.tv/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: new URLSearchParams({
        client_id: TWITCH_ID,
        client_secret: TWITCH_SECRET,
        grant_type: 'client_credentials',
      }),
    }),
    z.object({
      access_token: z.string(),
      expires_in: z.number(),
    }),
  )

  appTokenCache = {
    token: access_token,
    expiresAt: now.add({
      seconds: expires_in - 5,
    }),
  }

  return access_token
}

let gqlHeaders: Record<string, string> = {
  // Twitch website client-id
  'Client-ID': 'ue6666qo983tsx6so1t0vnawi233wa',
  'Content-Type': 'text/plain;charset=UTF-8',
}
export async function TwitchSetIntegrity() {
  gqlHeaders['X-Device-ID'] ??= Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((v) => v.toString(36).slice(-1))
    .join('')

  gqlHeaders['Client-Integrity'] ??= (
    await apiFetch(
      fetch(`https://gql.twitch.tv/integrity`, {
        method: 'POST',
        headers: gqlHeaders,
      }),
      z.object({
        token: z.string(),
      }),
    )
  ).token
}

const userSchema = z.object({
  id: z.string(),
  login: z.string(),
  display_name: z.string(),
  type: z.string(),
  broadcaster_type: z.string(),
  description: z.string(),
  profile_image_url: z.string(),
  offline_image_url: z.string(),
  view_count: z.number(),
  email: z.string().optional(),
  created_at: zTemporalString,
})

export type TwitchUser = z.infer<typeof userSchema>

export async function TwitchUserByLogin(login: string) {
  const r = await apiFetch(
    cachedFetch(`https://api.twitch.tv/helix/users?${new URLSearchParams({ login }).toString()}`, {
      headers: {
        'Client-ID': TWITCH_ID,
        Authorization: `Bearer ${await appToken()}`,
      },
    }),
    z.object({
      data: z.array(userSchema),
    }),
  )
  return r.data[0]
}

const videoSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  user_login: z.string(),
  user_name: z.string(),
  stream_id: z.string(),
  title: z.string(),
  description: z.string(),
  created_at: zTemporalString,
  published_at: zTemporalString,
  url: z.string(),
  thumbnail_url: z.string(),
  viewable: z.string(),
  view_count: z.number(),
  language: z.string(),
  type: z.string(),
  duration: zDurationString,
  muted_segments: z
    .array(
      z.object({
        duration: z.number(),
        offset: z.number(),
      }),
    )
    .nullish(),
})

export type TwitchVideo = z.infer<typeof videoSchema>

export async function TwitchVideosForUser(userID: string) {
  const r = await apiFetch(
    cachedFetch(
      `https://api.twitch.tv/helix/videos?${new URLSearchParams({ user_id: userID, type: 'archive', first: '100' }).toString()}`,
      {
        headers: {
          'Client-ID': TWITCH_ID,
          Authorization: `Bearer ${await appToken()}`,
        },
      },
    ),
    z.object({
      data: z.array(videoSchema),
    }),
  )
  return r.data
}

export async function TwitchVideoMetadataInternal(videoID: string) {
  const r = await apiFetch(
    cachedFetch(`https://gql.twitch.tv/gql`, {
      method: 'POST',
      headers: gqlHeaders,
      body: JSON.stringify({
        query: `
        query {
					video(id:"${videoID}") {
						title,
						status,
						lengthSeconds,
						owner {
							id
						}
					}
				}`,
        variables: {},
      }),
    }),
    z.object({
      data: z.object({
        video: z.object({
          title: z.string(),
          status: z.string(),
          lengthSeconds: z.number(),
          owner: z.object({
            id: z.string(),
          }),
        }),
      }),
    }),
  )
  return r.data.video
}

export async function TwitchVideoCommentsInternal(videoID: string, k: string, v: unknown) {
  const r = await apiFetch(
    cachedFetch(`https://gql.twitch.tv/gql`, {
      method: 'POST',
      headers: gqlHeaders,
      body: JSON.stringify({
        operationName: 'VideoCommentsByOffsetOrCursor',
        variables: { videoID, [k]: v },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: 'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a',
          },
        },
      }),
    }),
    z.object({
      data: z.object({
        video: z.object({
          comments: z.object({
            edges: z.array(
              z.object({
                cursor: z.string(),
                node: z.object({
                  id: z.string(),
                  contentOffsetSeconds: z.number(),
                  commenter: z
                    .object({
                      id: z.string(),
                      displayName: z.string(),
                    })
                    .nullish(),
                  message: z.object({
                    fragments: z.array(
                      z.object({
                        text: z.string(),
                        emote: z
                          .object({
                            emoteID: z.string(),
                          })
                          .nullish(),
                      }),
                    ),
                  }),
                }),
              }),
            ),
            pageInfo: z.object({
              hasNextPage: z.boolean(),
            }),
          }),
        }),
      }),
    }),
  )
  return r.data.video.comments
}

export async function TwitchUserThirdPartyEmotes(channelID: string) {
  const p1 = apiFetch(
    cachedFetch('https://api.betterttv.net/3/cached/emotes/global'),
    z.array(
      z.object({
        id: z.string(),
        code: z.string(),
      }),
    ),
  ).catch(() => [])
  const p2 = apiFetch(
    cachedFetch(`https://api.betterttv.net/3/cached/users/twitch/${channelID}`),
    z.object({
      channelEmotes: z.array(
        z.object({
          id: z.string(),
          code: z.string(),
        }),
      ),
      sharedEmotes: z.array(
        z.object({
          id: z.string(),
          code: z.string(),
        }),
      ),
    }),
  ).catch(() => ({ channelEmotes: [], sharedEmotes: [] }))
  const p3 = apiFetch(
    cachedFetch(`https://api.betterttv.net/3/cached/frankerfacez/users/twitch/${channelID}`),
    z.array(
      z.object({
        id: z.number(),
        code: z.string(),
      }),
    ),
  ).catch(() => [])
  const p4 = apiFetch(
    cachedFetch(`https://7tv.io/v3/users/twitch/${channelID}`),
    z.object({
      emote_set: z.object({
        emotes: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
          }),
        ),
      }),
    }),
  ).catch(() => ({ emote_set: { emotes: [] } }))

  const r = new Map<string, { id: string; text: string; source: 'bttv' | 'ffz' | '7tv' }>()
  const [r1, r2, r3, r4] = await Promise.all([p1, p2, p3, p4])
  for (const e of r1) {
    r.set(e.code, { id: e.id, text: e.code, source: 'bttv' })
  }
  for (const e of r2.channelEmotes) {
    r.set(e.code, { id: e.id, text: e.code, source: 'bttv' })
  }
  for (const e of r2.sharedEmotes) {
    r.set(e.code, { id: e.id, text: e.code, source: 'bttv' })
  }
  for (const e of r3) {
    r.set(e.code, { id: e.id.toString(), text: e.code, source: 'ffz' })
  }
  for (const e of r4.emote_set.emotes) {
    r.set(e.name, { id: e.id, text: e.name, source: '7tv' })
  }

  return r
}

export async function TwitchCDNNauth(videoID: string) {
  const r = await apiFetch(
    cachedFetch(`https://gql.twitch.tv/gql`, {
      method: 'POST',
      headers: gqlHeaders,
      body: JSON.stringify({
        operationName: 'PlaybackAccessToken',
        variables: {
          isLive: false,
          login: '',
          isVod: true,
          vodID: videoID, // This is the only not-hardcoded variable
          playerType: 'channel_home_live',
        },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: '0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712',
          },
        },
      }),
    }),
    z.object({
      data: z.object({
        videoPlaybackAccessToken: z.object({
          value: z.string(),
          signature: z.string(),
        }),
      }),
    }),
  )
  return r.data.videoPlaybackAccessToken
}

export async function TwitchCDNMasterPlaylist(
  videoID: string,
  nauth: { value: string; signature: string },
) {
  const r = await fetch(
    `https://usher.ttvnw.net/vod/${videoID}.m3u8?${new URLSearchParams({
      nauth: nauth.value,
      nauthsig: nauth.signature,
      allow_source: 'true',
      allow_spectre: 'true',
      allow_audio_only: 'true',
      player: 'twitchweb',
    })}`,
  )
  const b = await r.text()
  if (r.status !== 200) {
    throw new Error('invalid master playlist status code')
  }

  // Return the first url we find and hope it's the source quality
  const url = b.split('\n').find((l) => !l.startsWith('#'))
  if (!url) {
    throw new Error('could not find media playlist url in master playlist')
  }

  return url
}

export async function TwitchCDNMediaPlaylist(url: string, highlights: { s: number; e: number }[]) {
  const r = await fetch(url)
  const b = await r.text()
  if (r.status !== 200) {
    throw new Error('invalid media playlist status code')
  }

  let start = 0
  return b.split('\n').flatMap((l, idx, arr) => {
    if (l.startsWith('#')) {
      return []
    }

    const duration = Number(/#EXTINF:([\d\.]+),/.exec(arr[idx - 1]!)?.[1])
    const end = start + duration
    const include = highlights.some(
      (h) => (h.s - 20 <= start && start <= h.e + 20) || (h.s - 20 <= end && end <= h.e + 20),
    )

    start = end
    return include ? [new URL(l, url).href] : []
  })
}
