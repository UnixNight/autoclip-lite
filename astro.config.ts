import node from '@astrojs/node'
import solidJs from '@astrojs/solid-js'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [solidJs()],
  vite: {
    plugins: [tailwindcss()],
  },
  env: {
    schema: {
      TWITCH_ID: { context: 'server', access: 'secret', type: 'string' },
      TWITCH_SECRET: { context: 'server', access: 'secret', type: 'string' },
    },
  },
  devToolbar: {
    enabled: false,
  },
})
