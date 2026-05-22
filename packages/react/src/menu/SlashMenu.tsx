import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/react'
import { useEffect, useId, useMemo, type CSSProperties } from 'react'
import { useSlashMenu, type UseSlashMenuOptions } from '@vetra/react/menu/useSlashMenu'

export interface SlashMenuProps extends UseSlashMenuOptions {
  readonly className?: string
  readonly emptyLabel?: string
  readonly ariaLabel?: string
  readonly anchorElement?: HTMLElement | null
}

export function SlashMenu(props: SlashMenuProps) {
  const menu = useSlashMenu(props)
  const menuId = useId()
  const className = props.className ?? 'vetra-slash-menu'
  const anchorElement = props.anchorElement
  const anchored = anchorElement !== undefined
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

  useEffect(() => {
    if (!anchored) {
      return
    }

    refs.setReference(anchorElement ?? null)

    if (anchorElement !== null) {
      update()
    }
  }, [anchorElement, anchored, refs, update])

  return (
    <div
      aria-activedescendant={activeItemId}
      aria-label={props.ariaLabel ?? 'Slash menu'}
      className={className}
      data-floating={anchored ? 'true' : 'false'}
      data-vetra-slash-menu=""
      ref={anchored ? refs.setFloating : undefined}
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

          return (
            <button
              aria-current={active ? 'true' : undefined}
              className={`${className}__item`}
              data-active={active ? 'true' : 'false'}
              data-block-type={item.blockType}
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

function createItemElementId(menuId: string, itemId: string): string {
  return `${menuId}-${itemId}`
}
