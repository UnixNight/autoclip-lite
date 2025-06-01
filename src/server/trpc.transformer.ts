import { Temporal } from '@js-temporal/polyfill'
import { parse, stringify, uneval } from 'devalue'

export const transformer = {
  /**
   * Specify how the data sent from the client to the server should be transformed.
   */
  input: {
    /**
     * This function runs **on the client** before sending the data to the server.
     */
    serialize: (object: unknown) => stringify(object, reducers),
    /**
     * This function runs **on the server** to transform the data before it is passed to the resolver
     */
    deserialize: (object: string) => parse(object, revivers) as unknown,
  },
  /**
   * Specify how the data sent from the server to the client should be transformed.
   */
  output: {
    /**
     * This function runs **on the server** before sending the data to the client.
     */
    serialize: (object: unknown) => uneval(object, replacer),
    /**
     * This function runs **only on the client** to transform the data sent from the server.
     */
    deserialize: (object: string) =>
      Function('Temporal', `return (${object})`)(Temporal) as unknown, // eslint-disable-line @typescript-eslint/no-implied-eval
  },
}

const reducers = {
  TemporalInstant: (value: unknown) => value instanceof Temporal.Instant && value.toString(),
  TemporalDuration: (value: unknown) => value instanceof Temporal.Duration && value.toString(),
}

const revivers = {
  TemporalInstant: (value: string) => Temporal.Instant.from(value),
  TemporalDuration: (value: string) => Temporal.Duration.from(value),
}

const replacer = (value: unknown) => {
  if (value instanceof Temporal.Instant) return `Temporal.Instant.from("${value.toString()}")`
  if (value instanceof Temporal.Duration) return `Temporal.Duration.from("${value.toString()}")`
  return undefined
}
