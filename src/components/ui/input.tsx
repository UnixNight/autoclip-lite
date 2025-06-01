import type { ComponentProps } from 'solid-js'
import { splitProps } from 'solid-js'
import { cn } from '~/components/utils'

export const Input = (props: ComponentProps<'input'>) => {
  const [split, input] = splitProps(props, ['class'])
  return (
    <input
      {...input}
      class={cn(
        'rounded-lg border border-neutral-200 bg-neutral-950 px-2 py-1 text-xs font-semibold text-neutral-200 transition outline-none hover:border-white hover:bg-neutral-950/50 hover:text-white focus:border-white focus:text-white focus:ring-0',
        split.class,
      )}
    />
  )
}
