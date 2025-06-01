import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import type { APIRoute } from 'astro'
import { appRouter, createContextFactory } from '~/server/trpc'

export const ALL: APIRoute = (ctx) => {
  return fetchRequestHandler({
    endpoint: '/trpc',
    req: ctx.request,
    router: appRouter,
    createContext: createContextFactory(),
  })
}
