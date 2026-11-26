import { Search, X } from 'lucide-react'
import { useRef } from 'react'
import { useText } from '@/lib/i18n'
import { ariaKeys, KEYS, keysLabel, useShortcut } from '@/lib/shortcuts'
import { text } from './search-field.text'

/**
 * Run search in the top bar. Cmd+K (Ctrl+K elsewhere) focuses it from anywhere;
 * Esc clears the query, or leaves the field when it is already empty.
 */
export function SearchField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const t = useText(text)
  const input = useRef<HTMLInputElement>(null)

  useShortcut(KEYS.search, () => {
    input.current?.focus()
    input.current?.select()
  })

  return (
    <div className="group relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={input}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          if (value) onChange('')
          else e.currentTarget.blur()
        }}
        placeholder={t.placeholder}
        aria-label={t.label}
        aria-keyshortcuts={ariaKeys(KEYS.search)}
        className="h-8 w-full rounded-lg border border-sidebar-border bg-card pr-14 pl-8.5 text-body shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center">
        {value ? (
          <button
            type="button"
            aria-label={t.clear}
            onClick={() => {
              onChange('')
              input.current?.focus()
            }}
            className="grid size-5 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <kbd className="rounded-sm border border-sidebar-border bg-muted px-1.5 font-sans text-caption leading-[18px] text-muted-foreground group-focus-within:hidden">
            {keysLabel(KEYS.search)}
          </kbd>
        )}
      </div>
    </div>
  )
}
