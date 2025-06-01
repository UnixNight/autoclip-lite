import { createMemo, createSignal } from 'solid-js'
import { Button, Input } from './ui'

export const Search = (props: { theme: 'header' | 'index' }) => {
  const regexChannel =
    /^(?:(?:https?:\/\/)?(?:www\.)?twitch\.tv\/)?(?<channel>\w+)(?:\?.*)?(?:#.*)?$/i
  const regexVideo =
    /^(?:(?:https?:\/\/)?(?:www\.)?twitch\.tv\/videos\/)?(?<videoID>\d+)(?:\?.*)?(?:#.*)?$/i

  const [input, setInput] = createSignal('')
  const disabled = createMemo(() => {
    return !regexChannel.test(input()) && !regexVideo.test(input())
  })
  const search = (e: SubmitEvent) => {
    e.preventDefault()

    const videoMatch = regexVideo.exec(input())
    if (videoMatch && videoMatch.groups) {
      location.href = `/v/${videoMatch.groups.videoID}`
      return
    }

    const channelMatch = regexChannel.exec(input())
    if (channelMatch && channelMatch.groups) {
      location.href = `/c/${channelMatch.groups.channel}`
      return
    }
  }

  const formClass = createMemo(() => {
    switch (props.theme) {
      case 'index':
        return 'mx-auto mt-32 flex w-96 flex-col gap-4'
      case 'header':
        return 'flex gap-2'
      default:
        props.theme satisfies never
        return ''
    }
  })
  const textClass = createMemo(() => {
    switch (props.theme) {
      case 'index':
        return 'text-xl'
      case 'header':
        return 'text-base'
      default:
        props.theme satisfies never
        return ''
    }
  })

  return (
    <form class={formClass()} onSubmit={search}>
      <Input
        class={textClass()}
        type="text"
        placeholder="Zentreya or 1254907759"
        value={input()}
        onInput={(e) => setInput(e.target.value)}
      />
      <Button class={textClass()} type="submit" disabled={disabled()}>
        Load Video
      </Button>
    </form>
  )
}
