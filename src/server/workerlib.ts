/// <reference lib="WebWorker" />
import { onCleanup } from 'solid-js'

declare let self: SharedWorkerGlobalScope | DedicatedWorkerGlobalScope

type Port = { postMessage: (msg: any, opts?: StructuredSerializeOptions) => void }

type Context<TEvents extends Record<string, any>> = {
  send<K extends keyof TEvents>(name: K, data: TEvents[K]): void
  broadcast<K extends keyof TEvents>(name: K, data: TEvents[K]): void
  shutdown(): void
}

class WorkerBuilder<TEvents extends Record<string, any>> {
  events<TNewEvents extends Record<string, any>>() {
    return new WorkerBuilder<TNewEvents>()
  }

  create<TMethods extends Record<string, (ctx: Context<TEvents>, ...args: any[]) => any>>(
    methods: TMethods,
    init?: (ctx: Omit<Context<TEvents>, 'send'>) => void,
  ) {
    type IncomingMessage = {
      [K in keyof TMethods]: {
        id: number
        name: K
        data: TMethods[K] extends (ctx: Context<TEvents>, ...args: infer P) => any ? P : never
      }
    }[keyof TMethods]

    const ports = new Set<Port>()
    setInterval(() => {
      ports.forEach((p) => p.postMessage({ ping: true }))
    }, 1000)

    const handleMessage = async (p: Port, e: MessageEvent<IncomingMessage>) => {
      const ctx: Context<TEvents> = {
        send(event, data) {
          p.postMessage({ event, data })
        },
        broadcast(event, data) {
          ports.forEach((p) => {
            p.postMessage({ event, data })
          })
        },
        shutdown() {
          self.close()
        },
      }

      const { id, name, data } = e.data
      try {
        const r = await methods[name]?.(ctx, ...data)
        p.postMessage({ id, data: r })
      } catch (err) {
        p.postMessage({ id, err })
      }
    }

    if ('postMessage' in self) {
      ports.add(self)
      self.addEventListener('message', (e) => handleMessage(self, e))
    } else {
      self.addEventListener('connect', (e) => {
        e.ports.forEach((p) => {
          ports.add(p)
          p.onmessage = (e) => handleMessage(p, e)
        })
      })
    }

    init?.({
      broadcast(event, data) {
        ports.forEach((p) => {
          p.postMessage({ event, data })
        })
      },
      shutdown() {
        self.close()
      },
    })

    return undefined as unknown as { events: TEvents; methods: TMethods }
  }
}

export const workerLib = new WorkerBuilder()

export function workerClient<
  T extends { events: Record<string, any>; methods: Record<string, (...args: any[]) => any> },
>(workerURL: string, sharedWorker = true) {
  let lastMessage = performance.now()
  let nextID = 1
  const pendingRequests = new Map<number, { resolve: Function; reject: Function }>()
  const eventListeners = new Map<string, Function[]>()
  let messageWorker: (m: unknown) => void
  let closeWorker: () => void
  const handleMessage = (
    e: MessageEvent<{ id?: number; event?: string; data?: unknown; err?: unknown }>,
  ) => {
    lastMessage = performance.now()
    if (e.data.id) {
      const pending = pendingRequests.get(e.data.id)
      if (pending) {
        if (e.data.data) {
          pending.resolve(e.data.data)
        } else if (e.data.err) {
          pending.resolve(e.data.err)
        }
        pendingRequests.delete(e.data.id)
      }
    }
    if (e.data.event && e.data.data) {
      const arr = eventListeners.get(e.data.event) ?? []
      for (const l of arr) {
        l(e.data.data)
      }
    }
  }

  if ('SharedWorker' in window && sharedWorker) {
    const worker = new SharedWorker(workerURL, { type: 'module' })
    worker.port.addEventListener('message', handleMessage)
    messageWorker = worker.port.postMessage.bind(worker.port)
    closeWorker = worker.port.close.bind(worker.port)
    worker.port.start()
  } else {
    const worker = new Worker(workerURL, { type: 'module' })
    worker.addEventListener('message', handleMessage)
    messageWorker = worker.postMessage.bind(worker)
    closeWorker = worker.terminate.bind(worker)
  }

  // Keep track of whether the worker died. If so, restart
  const heartbeatInterval = setInterval(() => {
    const now = performance.now()
    if (now - lastMessage > 4200) {
      console.log('Lost shared worker, reloading...')
      location.reload()
    }
  }, 1000)

  // Clean up nicely
  onCleanup(() => {
    clearInterval(heartbeatInterval)
    closeWorker()
  })

  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'on') {
          return (name: string, callback: (data: unknown) => void) => {
            const l = eventListeners.get(name) ?? []
            l.push(callback)
            eventListeners.set(name, l)
          }
        } else {
          return (...data: unknown[]) => {
            return new Promise((resolve, reject) => {
              const id = nextID++
              pendingRequests.set(id, { resolve, reject })
              messageWorker({ id, name: property, data })
            })
          }
        }
      },
    },
  ) as {
    on: {
      [K in keyof T['events']]: (name: K, callback: (data: T['events'][K]) => void) => void
    }[keyof T['events']]
  } & {
    [K in keyof T['methods']]: T['methods'][K] extends (ctx: any, ...args: infer P) => infer R ?
      (...args: P) => R extends Promise<any> ? R : Promise<R>
    : never
  }
}
