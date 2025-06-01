import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/solid-query'
import { createTRPCClient, httpLink, loggerLink } from '@trpc/client'
import PQueue from 'p-queue'
import type { Accessor, JSXElement } from 'solid-js'
import type { AppRouter } from '~/server/trpc'
import { transformer } from '~/server/trpc.transformer'

export const trpc = createTRPCClient<AppRouter>({
  links: [
    loggerLink({
      enabled: () => true,
    }),
    httpLink({
      url: '/trpc',
      transformer,
    }),
  ],
})

export const TrpcProvider = (props: { children?: JSXElement }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 24 * 60 * 60 * 1000, // 1 day
        staleTime: Infinity,
      },
    },
  })

  return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
}

const useVideoQueue = new PQueue({ concurrency: 5 })
export const useVideo = (input?: Accessor<string | undefined>) =>
  useQuery(() => ({
    queryKey: ['video', input?.()],
    queryFn: ({ signal }) =>
      useVideoQueue.add(({ signal }) => trpc.video.query(input?.()!, { signal: signal! }), {
        signal,
        throwOnTimeout: true,
      }),
    enabled: !input || !!input(),
  }))
