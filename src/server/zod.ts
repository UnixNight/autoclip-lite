import { Temporal } from '@js-temporal/polyfill'
import { z } from 'zod/v4'

export const zTemporal = z.instanceof(Temporal.Instant)

export const zTemporalString = z.iso.datetime().transform((v) => Temporal.Instant.from(v))

export const zTemporalUnion = z.union([zTemporal, zTemporalString])

export const zDuration = z.instanceof(Temporal.Duration)

export const zDurationString = z
  .string()
  .transform((v) => Temporal.Duration.from(`PT${v.toUpperCase()}`))

export const zDurationUnion = z.union([zDuration, zDurationString])
