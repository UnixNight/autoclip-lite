import { createContextProvider } from '@solid-primitives/context'
import { Key } from '@solid-primitives/keyed'
import { Show, createEffect, createMemo } from 'solid-js'
import { createStore } from 'solid-js/store'
import { dfmt, nfmt, tfmt } from '~/components/utils'
import { transformer } from '~/server/trpc.transformer'
import type { TwitchVideo } from '~/server/twitchapi'
import { Header } from './header'
import { TrpcProvider, useVideo } from './trpc'

const [ScoresProvider, useScores] = createContextProvider(() => {
  const [scores, setScores] = createStore<(number | null)[]>([])
  const medianScore = createMemo(() => {
    const a = scores.filter((s) => typeof s === 'number')
    a.sort()
    return a.length > 0 ? a[Math.floor(a.length / 2)]! : 1
  }, 1)
  return { scores, medianScore, setScores }
})

export const Channel = (props: {
  videos: string
  user: { display_name: string; profile_image_url: string }
}) => {
  const videos = createMemo(() => {
    return transformer.output.deserialize(props.videos) as TwitchVideo[]
  })
  return (
    <TrpcProvider>
      <ScoresProvider>
        <Header />
        <div class="flex items-center justify-center gap-4 py-8">
          <img class="size-24" src={props.user.profile_image_url} />
          <div class="text-6xl font-bold">{props.user.display_name}</div>
        </div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] grid-rows-[min-content] gap-4 px-4 pb-8 sm:px-8">
          <Key each={videos()} by="id">
            {(video, idx) => <ChannelVideo idx={idx()} video={video()} />}
          </Key>
        </div>
      </ScoresProvider>
    </TrpcProvider>
  )
}

const ChannelVideo = (props: { idx: number; video: TwitchVideo }) => {
  const video = useVideo(() => props.video.id)
  const score = createMemo(() => {
    const lines = video.data?.lines
    if (!lines) {
      return null
    }

    const period = 60
    const maxOffset = lines.reduce((v, l) => (l.offset > v ? l.offset : v), 0)
    const numBuckets = Math.floor(maxOffset / period) + 1

    const chatters = new Array(numBuckets).fill(null).map(() => new Set<string>())
    for (const l of lines) {
      const b = Math.floor(l.offset / period)
      chatters[b]!.add(l.commenterID ?? '')
    }

    const data = chatters.map((s) => s.size)
    data.sort((a, b) => a - b)
    return data[Math.floor(data.length * 0.75)] ?? 0
  }, null)

  const s = useScores()
  createEffect(() => {
    s?.setScores(props.idx, score())
  })

  const thumbnail = createMemo(() => {
    return props.video.thumbnail_url.replace('%{width}', '960').replace('%{height}', '540')
  })

  return (
    <a href={`/v/${props.video.id}`} class="opacity-80 transition-opacity hover:opacity-100">
      <div
        class="grid aspect-video grid-cols-2 bg-cover p-2"
        style={{ 'background-image': `url('${thumbnail()}')` }}
      >
        <div class="self-start justify-self-start bg-black/80 px-1 whitespace-nowrap">
          {tfmt(props.video.duration)}
        </div>
        <div class="self-start justify-self-end bg-black/80 px-1 whitespace-nowrap">
          <Show when={score() !== null}>
            <span class="text-xs font-light">Score:&nbsp;</span>
            {nfmt(
              score() && s?.medianScore() ?
                Math.round((100 * score()!) / s.medianScore())
              : undefined,
            )}
          </Show>
        </div>
        <div class="self-end justify-self-start bg-black/80 px-1 whitespace-nowrap">
          {nfmt(props.video.view_count)}
          <span class="text-xs font-light">&nbsp;views</span>
        </div>
        <div class="self-end justify-self-end bg-black/80 px-1 whitespace-nowrap">
          {dfmt(props.video.created_at)}
        </div>
      </div>
      <div class="p-1 text-lg font-bold break-all">{props.video.title}</div>
    </a>
  )
}
