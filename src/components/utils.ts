import type { Temporal } from '@js-temporal/polyfill'
import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const numberFormatter = new Intl.NumberFormat()
export const nfmt = (n?: number) => {
  return n !== undefined ? numberFormatter.format(n) : undefined
}

export const dfmt = (s: Temporal.Instant) => {
  return s.toLocaleString('default', { month: 'short', day: 'numeric' })
}

export const tfmt = (dur: Temporal.Duration) => {
  const d = dur.round({
    largestUnit: 'hour',
    smallestUnit: 'second',
  })
  const h = d.hours.toString()
  const m = d.minutes.toString().padStart(2, '0')
  const s = d.seconds.toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

export const tfmt2 = (dur: Temporal.Duration) => {
  const d = dur.round({
    largestUnit: 'hour',
    smallestUnit: 'second',
  })
  const h = d.hours.toString()
  const m = d.minutes.toString()
  const s = d.seconds.toString()
  const mm = m.padStart(2, '0')
  const ss = s.padStart(2, '0')

  if (d.hours) return `${h}h${mm}m${ss}s`
  if (d.minutes) return `${m}m${ss}s`
  return `${s}s`
}
