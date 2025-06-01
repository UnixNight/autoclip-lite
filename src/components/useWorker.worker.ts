import { workerLib } from '~/server/workerlib'
import type { ApiChart, ApiEmote, ApiHighlight, ApiMeta } from './types'

export default workerLib.create({
  async process(_ctx, videoID: string, period: number, emotesIdxArr: number[], lines: Line[]) {
    period = Math.ceil(period)
    if (period < 1) {
      period = 1
    }

    // Initialization
    const start = performance.now()
    const maxOffset = lines.reduce((v, l) => (l.offset > v ? l.offset : v), 0)
    const numBuckets = Math.floor(maxOffset / period) + 1

    // First, find the metadata for the selector. This runs very fast and consumes basically no RAM.
    const meta: ApiMeta = {
      activity: 0,
      all_emotes: 0,
      emotes: [],
    }

    const emoteTotals = new Map<string, ApiEmote>()
    for (const l of lines) {
      meta.activity++

      for (const e of l.emotes) {
        meta.all_emotes++

        const m = {
          id: e.id,
          text: e.text,
          source: e.source,
          total: 1 + (emoteTotals.get(e.text)?.total || 0),
        }
        emoteTotals.set(e.text, m)
      }
    }
    meta.emotes = Array.from(emoteTotals.values())
    meta.emotes.sort((a, b) => b.total - a.total)

    // Now build the actual chart data. This takes more effort but should be OK
    const emotes = new Set(emotesIdxArr.map((idx) => meta.emotes[idx]!.text))
    const chart: ApiChart = {
      period: period,
      emotes: new Array(numBuckets).fill(0),
      lines: new Array(numBuckets).fill(0),
      chatters: new Array(numBuckets).fill(0),
    }
    const sets = {
      lines: new Array(numBuckets).fill(null).map(() => new Set<string>()),
      chatters: new Array(numBuckets).fill(null).map(() => new Set<string>()),
    }

    for (const l of lines) {
      const b = Math.floor(l.offset / period)

      if (emotes.size === 0) {
        sets.lines[b]!.add(l.id)
        sets.chatters[b]!.add(l.commenterID ?? '')
        continue
      }

      for (const e of l.emotes) {
        if (emotes.has(e.text)) {
          chart.emotes![b]!++
          sets.lines[b]!.add(l.id)
          sets.chatters[b]!.add(l.commenterID ?? '')
        }
      }
    }

    for (let b = 0; b < numBuckets; b++) {
      chart.lines[b] = sets.lines[b]!.size
      chart.chatters[b] = sets.chatters[b]!.size
    }
    if (emotes.size === 0) {
      chart.emotes = undefined
    }

    // Finally compute the highlights from the chart data. This is just anything over (p75 + 1.5 * (p75 - p25)) which google says is good
    // We only run this on the unique chatters line because thats the most reliable
    const dataCopy = [...chart.chatters]
    dataCopy.sort((a, b) => a - b)
    const p25 = dataCopy[Math.floor(dataCopy.length * 0.25)]!
    const p75 = dataCopy[Math.floor(dataCopy.length * 0.75)]!
    const cutoff = p75 + 1.5 * (p75 - p25)

    const highlights: ApiHighlight[] = []
    for (const [b, v] of chart.chatters.entries()) {
      const t = b * period
      if (v > cutoff) {
        if (highlights.length > 0 && highlights[highlights.length - 1]!.end === t) {
          const h = highlights[highlights.length - 1]!
          h.end = t + period
          if (v > h.peak) {
            h.peak = v
          }
        } else {
          highlights.push({
            start: t,
            end: t + period,
            peak: v,
          })
        }
      }
    }

    const end = performance.now()
    console.log(`processed api data in ${end - start}ms`, videoID, period, emotes)

    return { meta, chart, highlights }
  },
})

interface Line {
  id: string
  offset: number
  commenterID?: string | undefined
  emotes: Emote[]
}

interface Emote {
  id: string
  text: string
  source: string
}
