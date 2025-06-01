import { Button as ButtonPrimitive } from '@kobalte/core/button'
import type { ComponentProps } from 'solid-js'
import { createMemo, splitProps } from 'solid-js'
import { cn } from '~/components/utils'

type ButtonProps = ComponentProps<typeof ButtonPrimitive<'button'>> & {
  href?: never
}
type LinkProps = ComponentProps<typeof ButtonPrimitive<'a'>> & {
  href: string
}

type Props = (ButtonProps | LinkProps) & {
  theme?: 'white' | 'black' | 'red' | 'yellow'
}

export const Button = (props: Props) => {
  const [split, button] = splitProps(props, ['class', 'theme'])
  const theme = createMemo(() => split.theme ?? 'white')
  const linkProps = () => {
    if (!('href' in button) || !button.href) return {}
    return {
      as: 'a',
      role: 'button',
      target: button.target ?? (button.href.startsWith('https://') ? '_blank' : undefined),
      rel: button.rel ?? (button.href.startsWith('https://') ? 'noreferrer' : undefined),
    }
  }
  return (
    <ButtonPrimitive
      class={cn(
        'flex items-center justify-center gap-2 rounded-lg border px-2 py-1 font-semibold uppercase transition',
        theme() === 'white' &&
          'border-neutral-200 text-neutral-200 hover:border-white hover:bg-white/20 hover:text-white',
        theme() === 'black' &&
          'border-neutral-800 text-neutral-800 hover:border-black hover:bg-black/20 hover:text-black',
        theme() === 'red' &&
          'border-red-500 text-red-500 hover:border-red-600 hover:bg-red-900/20 hover:text-red-600',
        theme() === 'yellow' && 'border-yellow-500 text-yellow-500 hover:bg-yellow-500/10',
        'disabled:cursor-not-allowed disabled:opacity-60',
        split.class,
      )}
      {...button}
      {...linkProps()}
    />
  )
}
