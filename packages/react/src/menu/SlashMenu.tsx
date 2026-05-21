import { useId } from 'react'
import { useSlashMenu, type UseSlashMenuOptions } from '@vetra/react/menu/useSlashMenu'

export interface SlashMenuProps extends UseSlashMenuOptions {
  readonly className?: string
  readonly emptyLabel?: string
  readonly ariaLabel?: string
}

export function SlashMenu(props: SlashMenuProps) {
  const menu = useSlashMenu(props)
  const menuId = useId()
  const className = props.className ?? 'vetra-slash-menu'
  const activeItemId =
    menu.activeItem === undefined ? undefined : createItemElementId(menuId, menu.activeItem.id)

  return (
    <div
      aria-activedescendant={activeItemId}
      aria-label={props.ariaLabel ?? 'Slash menu'}
      className={className}
      data-vetra-slash-menu=""
      onKeyDown={menu.handleKeyDown}
      role="menu"
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
