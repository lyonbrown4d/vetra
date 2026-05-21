import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useEditor } from '@vetra/react/context/EditorContext'
import { defaultSlashMenuItems, filterSlashMenuItems } from '@vetra/react/menu/defaultItems'
import {
  createSlashMenuIntent,
  dispatchSlashMenuIntent,
  type SlashMenuBlockIdFactory,
  type SlashMenuItem,
  type SlashMenuMode,
  type SlashMenuSelectHandler,
} from '@vetra/react/menu/types'

export interface UseSlashMenuOptions {
  readonly targetBlockId: string
  readonly mode: SlashMenuMode
  readonly idFactory: SlashMenuBlockIdFactory
  readonly query?: string
  readonly items?: readonly SlashMenuItem[]
  readonly onClose?: () => void
  readonly onSelect?: SlashMenuSelectHandler
}

export interface SlashMenuController {
  readonly items: readonly SlashMenuItem[]
  readonly activeIndex: number
  readonly activeItem: SlashMenuItem | undefined
  readonly setActiveIndex: (index: number) => void
  readonly handleKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  readonly selectActiveItem: () => void
  readonly selectItem: (item: SlashMenuItem) => void
}

export function useSlashMenu(options: UseSlashMenuOptions): SlashMenuController {
  const editor = useEditor()
  const sourceItems = options.items ?? defaultSlashMenuItems
  const query = options.query ?? ''
  const items = useMemo(() => filterSlashMenuItems(sourceItems, query), [query, sourceItems])
  const [activeIndex, setActiveIndexState] = useState(0)
  const activeItem = items[activeIndex]

  useEffect(() => {
    setActiveIndexState((currentIndex) => {
      if (items.length === 0) {
        return 0
      }

      return Math.min(currentIndex, items.length - 1)
    })
  }, [items.length])

  const setActiveIndex = useCallback(
    (nextIndex: number) => {
      setActiveIndexState(normalizeActiveIndex(nextIndex, items.length))
    },
    [items.length],
  )

  const selectItem = useCallback(
    (item: SlashMenuItem) => {
      const intent = createSlashMenuIntent({
        item,
        mode: options.mode,
        targetBlockId: options.targetBlockId,
        idFactory: options.idFactory,
      })
      const result = dispatchSlashMenuIntent(editor, intent)

      options.onSelect?.({ item, intent, result })
      if (result.ok) {
        options.onClose?.()
      }
    },
    [editor, options],
  )

  const selectActiveItem = useCallback(() => {
    if (activeItem === undefined) {
      return
    }

    selectItem(activeItem)
  }, [activeItem, selectItem])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          event.stopPropagation()
          setActiveIndex(activeIndex + 1)
          break
        case 'ArrowUp':
          event.preventDefault()
          event.stopPropagation()
          setActiveIndex(activeIndex - 1)
          break
        case 'Enter':
          event.preventDefault()
          event.stopPropagation()
          selectActiveItem()
          break
        case 'Escape':
          event.preventDefault()
          event.stopPropagation()
          options.onClose?.()
          break
      }
    },
    [activeIndex, options, selectActiveItem, setActiveIndex],
  )

  return {
    items,
    activeIndex,
    activeItem,
    setActiveIndex,
    handleKeyDown,
    selectActiveItem,
    selectItem,
  }
}

function normalizeActiveIndex(index: number, itemCount: number): number {
  if (itemCount === 0) {
    return 0
  }

  return ((index % itemCount) + itemCount) % itemCount
}
