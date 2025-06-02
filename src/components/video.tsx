import { Temporal } from '@js-temporal/polyfill'
import { createContextProvider } from '@solid-primitives/context'
import { Key } from '@solid-primitives/keyed'
import { makePersisted } from '@solid-primitives/storage'
import ChartJS from 'chart.js/auto'
import { getRelativePosition } from 'chart.js/helpers'
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import { TrpcProvider, useVideo } from '~/components/trpc'
import type WorkerClass from '~/components/useWorker.worker'
import workerURL from '~/components/useWorker.worker?worker&url'
import { nfmt, tfmt, tfmt2 } from '~/components/utils'
import { workerClient } from '~/server/workerlib'
import { Header } from './header'
import { Logo } from './icons'
import type { ApiChart, ApiEmote, ChartData } from './types'
import { Button, Input, Select } from './ui'
import { cn } from './utils'

ChartJS.defaults.backgroundColor = 'rgba(255,255,255,0.1)'
ChartJS.defaults.borderColor = 'rgba(255,255,255,0.1)'
ChartJS.defaults.color = '#AAA'

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
function parseBigInt(str: string, base = 62n) {
  return Array.from(str).reduce((acc, digit) => {
    const pos = BigInt(alphabet.indexOf(digit))
    return acc * base + pos
  }, 0n)
}
function stringifyBigInt(n: bigint, base = 62n) {
  const r: string[] = []
  while (n > 0n) {
    r.push(alphabet[Number(n % base)]!)
    n /= base
  }
  return r.reverse().join('')
}

const [AutoclipProvider, useAutoclip] = createContextProvider((props: { videoID: string }) => {
  // "period" is the granularity we group lines by. It's stored in ?period=XYZ and is rounded to the nearest multiple of 30sec.
  const [rawPeriod, setRawPeriod] = useQueryParam('period')
  const period = createMemo(() => Math.ceil(parseInt(rawPeriod() ?? '60', 10) / 30) * 30, 60)
  const setPeriod = (v: number) => setRawPeriod(v.toString())

  // "emotes" is a list of indexes of which emotes we care about. It's stored in ?emotes=XYZ and is a bitmask converted to base62
  const [rawEmotes, setRawEmotes] = useQueryParam('emotes')
  const emotes = createMemo(() => {
    let n = parseBigInt(rawEmotes() ?? '0')
    const selected = new Array<number>()
    for (let i = 0; n > 0; i++) {
      if (n & 1n) {
        selected.push(i)
      }
      n = n >> 1n
    }
    return selected
  })
  const setEmotes = (selectedIndexes: number[]) => {
    const n = selectedIndexes.reduce((n, v) => n | (1n << BigInt(v)), 0n)
    setRawEmotes(n > 0 ? stringifyBigInt(n) : null)
  }

  // "seek" is a function that gets passed up from VideoPlayer for when user clicks in Chart
  const [seekFn, setSeekFn] = createSignal((_seconds: number) => {
    /* no-op */
  })

  // "viewed" is an array of which 30 second chunks of video have been seen.
  const [viewed, setViewed] = makePersisted(createStore<Array<boolean>>([]), {
    name: `viewed:${props.videoID}`,
    serialize: (d) => Array.from(d, (b) => (b ? 'T' : 'F')).join(''),
    deserialize: (d) => Array.from(d).map((v) => v === 'T'),
  })

  // We make a webworker, fetch the "lines" from the API, and pass it into the webworker to process
  const worker = workerClient<typeof WorkerClass>(workerURL, false)
  const video = useVideo(() => props.videoID)
  const processInput = createMemo(() => ({
    videoID: props.videoID,
    period: period(),
    emotes: emotes(),
    lines: video.data?.lines,
  }))
  const [processed] = createResource(processInput, async (input) => {
    if (!input.videoID || !input.period || !input.emotes || !input.lines) {
      return undefined
    }
    return await worker.process(input.videoID, input.period, input.emotes, unwrap(input.lines))
  })
  const loading = createMemo(() => {
    return video.isLoading || !processed.latest
  })

  return {
    videoID: props.videoID,
    period,
    setPeriod,
    emotes,
    setEmotes,
    seek: (seconds: number) => {
      seekFn()(seconds)
    },
    setSeek: (fn: (_seconds: number) => void) => {
      setSeekFn(() => fn)
    },
    viewed,
    setViewed,
    processed,
    loading,
  }
})

export const Video = (props: { videoID: string }) => {
  return (
    <TrpcProvider>
      <AutoclipProvider videoID={props.videoID}>
        <Header />
        <div class="scrollbar-track-neutral-700 scrollbar-thumb-neutral-300 grid flex-auto grid-cols-[300px_1fr_300px] grid-rows-[min-content_min-content_1fr] pt-4">
          <VideoPlayer class="col-span-2" />
          <Highlights />
          <Period />
          <Chart class="col-span-2 row-span-2" />
          <ChartSelector />
        </div>
      </AutoclipProvider>
    </TrpcProvider>
  )
}

const VideoPlayer = (props: { class?: string }) => {
  const a = useAutoclip()
  if (!a) {
    throw new Error('autoclip context not set')
  }

  onMount(() => {
    const player = new Twitch.Player('twitch-video-player', {
      width: '100%',
      height: '100%',
      video: a.videoID,
      autoplay: false,
      time: '0h0m0s',
    })
    a.setSeek((seconds) => {
      player.seek(seconds)
      player.play()
    })

    let position = 0
    const positionPoller = setInterval(() => {
      const p = player.getCurrentTime()
      if (!player.isPaused() && position < p && p < position + 2) {
        const bucket = Math.floor(p / 30)
        a.setViewed(bucket, true)
      }
      position = p
    }, 1000)
    onCleanup(() => {
      clearInterval(positionPoller)
    })
  })

  return (
    <div class={cn(props.class, 'bg-black')}>
      <div id="twitch-video-player" class="mx-auto aspect-video max-h-[50vh]"></div>
    </div>
  )
}

const Highlights = (props: { class?: string }) => {
  const a = useAutoclip()
  if (!a) {
    throw new Error('autoclip context not set')
  }

  const options = createMemo(() =>
    a.processed()?.highlights.map((h) => ({
      title: `${tfmt(Temporal.Duration.from({ seconds: h.start }))} - ${tfmt(Temporal.Duration.from({ seconds: h.end }))}`,
      subtitle: `${nfmt(h.peak)} peak chatters`,
      onclick: () => {
        a.seek(h.start - 5)
      },
    })),
  )

  const downloadLink = createMemo(() => {
    return `/clip?d=${JSON.stringify({
      video: a.videoID,
      highlights: a.processed()?.highlights.map((h) => ({ s: h.start, e: h.end })),
    })}`
  })

  return (
    <div class={cn(props.class, 'flex flex-col')}>
      <div class="relative flex-1">
        <div class={cn('scrollbar-thin absolute inset-0 overflow-y-auto', a.loading() && 'hidden')}>
          <Key each={options() ?? []} by="title">
            {(o) => (
              <div
                onClick={o().onclick}
                class="cursor-pointer px-4 py-2 text-center hover:bg-neutral-700"
              >
                <div class="truncate text-lg font-semibold">{o().title}</div>
                <div class="truncate text-sm font-light">{o().subtitle}</div>
              </div>
            )}
          </Key>
        </div>
        <div class={cn('grid h-full place-items-center', !a.loading() && 'hidden')}>
          <Logo class="size-48" spin />
        </div>
      </div>
      <div class="px-4 py-2">
        <Button class="w-full" href={downloadLink()} disabled={!options()?.length}>
          Download Highlights
        </Button>
      </div>
    </div>
  )
}

const Period = (props: { class?: string }) => {
  const a = useAutoclip()
  if (!a) {
    throw new Error('autoclip context not set')
  }

  return (
    <label class={cn(props.class, 'flex items-center gap-2 px-4 py-2')}>
      <span class="whitespace-nowrap">Time Period:</span>
      <Select
        label="Time Period"
        value={a.period().toString()}
        onChange={(v) => a.setPeriod(parseInt(v))}
        items={[
          { label: '30 seconds', value: '30' },
          { label: '1 minute', value: '60' },
          { label: '5 minutes', value: '300' },
        ]}
      />
    </label>
  )
}

const ChartSelector = (props: { class?: string }) => {
  const a = useAutoclip()
  if (!a) {
    throw new Error('autoclip context not set')
  }
  const selected = createMemo(() => new Set(a.emotes() ?? []))

  const [search, setSearch] = createSignal('')
  const iconURL = (e: ApiEmote) => {
    switch (e.source) {
      case 'twitch':
        return `https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/3.0`
      case 'bttv':
        return `https://cdn.betterttv.net/emote/${e.id}/3x`
      case 'ffz':
        return `https://cdn.betterttv.net/frankerfacez_emote/${e.id}/4`
      case '7tv':
        return `https://cdn.7tv.app/emote/${e.id}/4x.webp`
      default:
        return ''
    }
  }
  const options = createMemo(() => {
    const p = a.processed()
    if (!p) {
      return []
    }
    return p.meta.emotes.slice(0, 200).map((e, idx) => ({
      id: e.id,
      iconURL: iconURL(e),
      title: e.text,
      subtitle: `${nfmt(e.total)} emotes`,
      selected: () => selected().has(idx),
      hidden: () => search() && !e.text.toLowerCase().includes(search().toLowerCase()),
      onclick: () => {
        if (selected().has(idx)) {
          a.setEmotes(a.emotes().filter((v) => v !== idx))
        } else {
          a.setEmotes([...a.emotes(), idx])
        }
      },
    }))
  })

  return (
    <div class={cn(props.class, 'flex flex-col')}>
      <div class={cn('contents', a.loading() && 'hidden')}>
        <div
          class={cn(
            'cursor-pointer px-8 py-2 hover:bg-neutral-700',
            selected().size === 0 && 'bg-neutral-700/70',
          )}
          onClick={() => {
            a.setEmotes([])
          }}
        >
          <div class="truncate text-lg font-semibold">Chat Activity</div>
          <div class="truncate text-sm font-light">
            {nfmt(a.processed()?.meta.activity ?? 0)} messages
          </div>
        </div>
        <div
          class={cn(
            'cursor-pointer px-8 py-2 hover:bg-neutral-700',
            selected().size === options().length && 'bg-neutral-700/70',
          )}
          onClick={() => {
            a.setEmotes(options().map((_, idx) => idx))
          }}
        >
          <div class="truncate text-lg font-semibold">All Emotes</div>
          <div class="truncate text-sm font-light">
            {nfmt(a.processed()?.meta.all_emotes ?? 0)} emotes
          </div>
        </div>
        <div class="p-2">
          <Input
            class="w-full text-base"
            type="text"
            placeholder="Search"
            value={search()}
            onInput={(e) => setSearch(e.target.value)}
          />
        </div>
        <div class="relative min-h-16 flex-1">
          <div class="scrollbar-thin absolute inset-0 overflow-y-auto">
            <Key each={options()} by="id">
              {(o) => (
                <div
                  class={cn(
                    'flex cursor-pointer items-center gap-4 px-4 py-2 hover:bg-neutral-700',
                    o().selected() && 'bg-neutral-700/70',
                    o().hidden() && 'hidden',
                  )}
                  onClick={o().onclick}
                >
                  <img
                    class="size-12 flex-none"
                    src={o().iconURL}
                    alt={o().title}
                    loading="lazy"
                    decoding="async"
                  />
                  <div class="min-w-0">
                    <div class="truncate text-lg font-semibold">{o().title}</div>
                    <div class="truncate text-sm font-light">{o().subtitle}</div>
                  </div>
                </div>
              )}
            </Key>
          </div>
        </div>
      </div>
      <div class={cn('grid h-full place-items-center', !a.loading() && 'hidden')}>
        <Logo class="size-48" spin />
      </div>
    </div>
  )
}

const Chart = (props: { class?: string }) => {
  const a = useAutoclip()
  if (!a) {
    throw new Error('autoclip context not set')
  }
  const viewed = createMemo(() => {
    const scale = a.period() / 30
    const arr = new Array<boolean>(Math.ceil(a.viewed.length / scale)).fill(false)
    for (const [k, v] of a.viewed.entries()) {
      const i = Math.floor(k / scale)
      arr[i] ||= v
    }
    return arr
  })
  const converted = createMemo(() => {
    const p = a.processed()
    return p ? convertData(p.chart, viewed()) : undefined
  })

  let canvas: HTMLCanvasElement | undefined = undefined
  onMount(() => {
    const chartInstance = new ChartJS(canvas!, {
      type: 'bar',
      data: {
        datasets: [],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
        },
        layout: {
          padding: 10,
        },
        plugins: {
          title: {
            display: false,
            text: '',
            padding: 0,
          },
        },
        onClick: (e) => {
          const canvasPosition = getRelativePosition(e, chartInstance as any)
          const dataX = chartInstance.scales.x!.getValueForPixel(canvasPosition.x)
          const seconds = (dataX || 0) * a.period()
          a.seek(seconds)
        },
      },
    })

    createEffect((prev) => {
      const d = converted()
      if (!d) {
        return viewed()
      }
      // chart.options.plugins!.title!.text = d.title
      for (const [idx, v] of d.datasets.entries()) {
        const meta = chartInstance.getDatasetMeta(idx)
        const ds = chartInstance.data.datasets[idx]
        if (meta && meta.hidden !== null) {
          v.hidden = meta.hidden
        } else if (ds && ds.hidden !== null) {
          v.hidden = ds.hidden
        }
      }
      chartInstance.data = d
      chartInstance.update(prev === viewed() ? undefined : 'none')
      return viewed()
    }, [])
  })

  return (
    <div class={cn(props.class, 'relative')}>
      <div
        class={cn('scrollbar-thin absolute inset-0 overflow-x-auto', a.loading() && 'opacity-0')}
      >
        <div class="h-full" style={{ 'min-width': `${5 * (converted()?.labels.length ?? 0)}px` }}>
          <canvas ref={canvas}></canvas>
        </div>
      </div>
      <div class={cn('grid h-full place-items-center', !a.loading() && 'hidden')}>
        <Logo class="size-48" spin />
      </div>
    </div>
  )
}

function useQueryParam(name: string) {
  const [query, setQuery] = createSignal('')
  const refreshQuery = () => {
    setQuery(location.search)
  }
  onMount(() => {
    refreshQuery()
    window.addEventListener('popstate', refreshQuery)
    onCleanup(() => {
      window.removeEventListener('popstate', refreshQuery)
    })
  })

  const param = createMemo(() => {
    return new URLSearchParams(query()).get(name)
  })
  const setParam = (value: string | null) => {
    const url = new URL(location.href)
    if (value) {
      url.searchParams.set(name, value)
    } else {
      url.searchParams.delete(name)
    }
    history.pushState({}, '', url)
    refreshQuery()
  }

  return [param, setParam] as const
}

function convertData(d: ApiChart, viewed: boolean[]): ChartData {
  const labels = (p: number, l: number) => {
    return new Array(l).fill(0).map((_, idx) => tfmt2(Temporal.Duration.from({ seconds: p * idx })))
  }

  const bgColors = (hue: number, viewed: boolean[], l: number) => {
    return new Array(l).fill('').map((_, idx) => `hsl(${hue}, 100%, ${viewed[idx] ? 20 : 40}%)`)
  }

  const r: ChartData = {
    title: '',
    labels: labels(d.period, d.lines.length),
    datasets: [
      {
        label: 'Chatters',
        data: d.chatters,
        backgroundColor: bgColors(240, viewed, d.lines.length),
        grouped: false,
      },
      {
        label: 'Messages',
        data: d.lines,
        backgroundColor: bgColors(0, viewed, d.lines.length),
        grouped: false,
      },
    ],
  }
  if (d.emotes && d.emotes.length) {
    r.datasets.push({
      label: 'Emotes',
      data: d.emotes,
      backgroundColor: bgColors(120, viewed, d.lines.length),
      grouped: false,
      hidden: true,
    })
  }

  return r
}
