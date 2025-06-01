import { Select as SelectPrimitive } from '@kobalte/core/select'
import { createMemo } from 'solid-js'
import { SelectorIcon, WarningIcon } from '~/components/icons'

type SelectItem<T extends string> = { label: string; value: T; icon?: 'warning' }
export const Select = <T extends string>(props: {
  label: string
  items: SelectItem<T>[]
  value: T
  onChange: (value: T) => void
}) => {
  const value = createMemo(() => props.items.find((i) => i.value === props.value)!)
  return (
    <SelectPrimitive
      class="flex-auto"
      value={value()}
      onChange={(v) => props.onChange(v!.value)}
      options={props.items}
      optionTextValue="label"
      optionValue="value"
      placeholder="Select..."
      itemComponent={(props) => (
        <SelectPrimitive.Item
          item={props.item}
          class="relative flex cursor-pointer items-center justify-between gap-2 p-2 text-sm outline-none data-[highlighted]:bg-white/20 data-[highlighted]:text-white"
        >
          <SelectPrimitive.ItemLabel>{props.item.textValue}</SelectPrimitive.ItemLabel>
          {props.item.rawValue.icon === 'warning' && <WarningIcon class="size-4" />}
        </SelectPrimitive.Item>
      )}
    >
      <SelectPrimitive.Trigger
        aria-label={props.label}
        class="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-950 px-2 py-1 text-xs font-semibold text-neutral-200 transition outline-none hover:border-white hover:bg-neutral-950/50 hover:text-white"
      >
        <SelectPrimitive.Value<SelectItem<T>> class="flex items-center gap-2 truncate">
          {(state) => (
            <>
              {state.selectedOption().icon === 'warning' && <WarningIcon class="size-4" />}
              {state.selectedOption().label}
            </>
          )}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon>
          <SelectorIcon class="size-5" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content class="rounded-lg border border-neutral-200 bg-neutral-950 text-neutral-200">
          <SelectPrimitive.Listbox class="max-h-64 overflow-y-auto outline-none" />
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive>
  )
}
