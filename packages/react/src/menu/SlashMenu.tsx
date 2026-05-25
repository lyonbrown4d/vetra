import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/react'
import {
  Code,
  Heading1,
  Heading2,
  MessageSquareText,
  Quote,
  SeparatorHorizontal,
  SquareCheckBig,
  Type,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, type CSSProperties } from 'react'
import { useSlashMenu, type UseSlashMenuOptions } from '@vetra/react/menu/useSlashMenu'

export interface SlashMenuProps extends UseSlashMenuOptions {
  readonly className?: string
  readonly emptyLabel?: string
  readonly ariaLabel?: string
  readonly anchorElement?: HTMLElement | null
  readonly autoFocus?: boolean
}

export function SlashMenu(props: SlashMenuProps) {
  const menu = useSlashMenu(props)
  const menuId = useId()
  const floatingElementRef = useRef<HTMLDivElement | null>(null)
  const className = props.className ?? 'vetra-slash-menu'
  const anchorElement = props.anchorElement
  const anchored = anchorElement !== undefined && anchorElement !== null
  const middleware = useMemo(
    () => [
      offset({ mainAxis: 8, alignmentAxis: -2 }),
      flip({ padding: 12 }),
      shift({ padding: 12 }),
      size({
        padding: 12,
        apply({ availableWidth, elements }) {
          const maxWidth = Math.max(240, Math.min(340, availableWidth))

          elements.floating.style.setProperty(
            '--vetra-slash-menu-max-width',
            `${String(maxWidth)}px`,
          )
        },
      }),
    ],
    [],
  )
  const { refs, floatingStyles, update } = useFloating({
    middleware,
    placement: 'bottom-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
  })
  const floatingStyle: CSSProperties | undefined = anchored
    ? {
        ...floatingStyles,
        zIndex: 40,
      }
    : undefined
  const activeItemId =
    menu.activeItem === undefined ? undefined : createItemElementId(menuId, menu.activeItem.id)
  const setFloatingElement = useCallback(
    (element: HTMLDivElement | null) => {
      floatingElementRef.current = element
      refs.setFloating(element)
    },
    [refs],
  )

  useEffect(() => {
    if (!anchored) {
      return
    }

    refs.setReference(anchorElement)
    update()
  }, [anchorElement, anchored, refs, update])

  useEffect(() => {
    if (props.autoFocus !== true) {
      return
    }

    floatingElementRef.current?.focus({ preventScroll: true })
  }, [props.autoFocus])

  return (
    <div
      aria-activedescendant={activeItemId}
      aria-label={props.ariaLabel ?? 'Slash menu'}
      autoFocus={props.autoFocus}
      className={className}
      data-floating={anchored ? 'true' : 'false'}
      data-vetra-slash-menu=""
      ref={anchored ? setFloatingElement : undefined}
      onKeyDown={menu.handleKeyDown}
      role="menu"
      style={floatingStyle}
      tabIndex={0}
    >
      {menu.items.length === 0 ? (
        <div className={`${className}__empty`} role="status">
          {props.emptyLabel ?? 'No matching blocks'}
        </div>
      ) : (
        menu.items.map((item, index) => {
          const active = index === menu.activeIndex
          const Icon = item.icon === undefined ? undefined : slashMenuIcons[item.icon]

          return (
            <button
              aria-current={active ? 'true' : undefined}
              className={`${className}__item`}
              data-active={active ? 'true' : 'false'}
              data-block-type={item.blockType}
              data-icon={item.icon}
              data-vetra-slash-menu-item={item.id}
              id={createItemElementId(menuId, item.id)}
              key={item.id}
              onClick={() => {
                menu.selectItem(item)
              }}
              onMouseEnter={() => {
                menu.setActiveIndex(index)
              }}
              role="menuitem"
              type="button"
            >
              {Icon === undefined ? null : (
                <span
                  aria-hidden="true"
                  className={`${className}__item-icon`}
                  data-vetra-slash-menu-item-icon={item.icon}
                >
                  <Icon aria-hidden="true" size={16} strokeWidth={2} />
                </span>
              )}
              <span className={`${className}__item-label`}>{item.label}</span>
              {item.description === undefined ? null : (
                <span className={`${className}__item-description`}>{item.description}</span>
              )}
            </button>
          )
        })
      )}
    </div>
  )
}

const slashMenuIcons: Readonly<Record<string, LucideIcon>> = {
  code: Code,
  'check-square': SquareCheckBig,
  'heading-1': Heading1,
  'heading-2': Heading2,
  'message-square-text': MessageSquareText,
  'separator-horizontal': SeparatorHorizontal,
  quote: Quote,
  text: Type,
}

function createItemElementId(menuId: string, itemId: string): string {
  return `${menuId}-${itemId}`
}
