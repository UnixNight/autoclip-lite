import { Search } from './search'
import { Button } from './ui/button'

export const Header = () => {
  return (
    <div class="flex items-center justify-between gap-4 px-4 pt-2 sm:px-8 sm:pt-4">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div>
          <div class="text-lg font-extralight whitespace-nowrap sm:text-2xl">
            <a href="/">Autoclip</a>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <Button class="text-xs/5" href="https://ko-fi.com/fugitech">
            Kofi
          </Button>
        </div>
      </div>
      <Search theme="header" />
      <div></div>
    </div>
  )
}
