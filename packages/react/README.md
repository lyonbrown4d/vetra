# @vetra/react

Official React renderer for Vetra.

This package owns React context, hooks, block rendering, and virtualized rendering with TanStack Virtual. It consumes `@vetra/core` through the command system and does not mutate document state directly.

The renderer exposes block-level selector hooks such as `useBlock`, active lifecycle helpers such as `useActiveBlockLifecycle` / `useSelectBlock`, slash menu primitives such as `SlashMenu` / `useSlashMenu`, and debug hooks such as `useMountedBlockCount` for future virtualization and performance tests.

## Notion-like interactions

`EditorRoot` opens the slash menu from the active block and anchors it with Floating UI using fixed positioning, so the menu does not shift document flow. The menu auto-focuses when opened, supports Arrow navigation, `Home` / `End` jumps, `Enter` or `Tab` confirmation, `Escape` close, and closes when the user clicks another block. Default items expose `icon`, `aliases`, and `keywords` metadata rendered with Lucide icons, so queries such as `/h1`, `/h2`, `/todo`, `/note`, and `/code js` can resolve to matching block actions without adding a custom icon system.

Block gutter controls are renderer-owned UI. The plus control dispatches `insertBlockAfter` with an empty paragraph, updates selection through `setSelection`, and focuses the new active block after render so callers can type immediately. The drag handle wires into dnd-kit and keeps reorder changes routed through the core `moveBlock` command.

## Paste

`createPasteHandler` and `usePasteHandler` provide renderer-owned paste orchestration. The default strategy treats clipboard text as plain text through `@vetra/import-plain-text`, converts it to a block fragment, and dispatches the core `insertBlockFragment` command against a caller-provided reference block. The generic handler does not read DOM selection.

`EditorRoot` owns browser clipboard events for block-level selection. When a block or block range is selected, copy and cut write:

- `application/x.vetra.blocks+json`: a Vetra document fragment encoded with `@vetra/persistence-json`, preserving selected root blocks and their selected subtrees.
- `text/plain`: a readable fallback assembled from the selected block trees.

Paste prefers the Vetra block MIME when present, then `text/html` through `@vetra/import-html`, then `text/plain`. Pasted block ids are remapped before dispatch. Browser events, MIME priority, focus restoration, and clipboard fallbacks stay in `@vetra/react`; `@vetra/core` stays framework-agnostic and only receives command intents.

Markdown remains opt-in: callers can pass an explicit `PasteBlockStrategy`, or wrap a document importer with `createDocumentPasteStrategy`, instead of relying on automatic format guessing.

HTML remains an adapter concern. `@vetra/import-html` and `@vetra/export-html` own external HTML conversion; browser `text/html` paste is wired through those adapters from React rather than by adding HTML parsing to core.

Atomic block fragment paste is in place: multi-block or subtree paste is one core command, one transaction, and one undo step. When the current `DocumentSelection` is a block range, paste replaces the selected blocks before focusing the inserted fragment.

## Block toolbar

`useBlockToolbar` and `BlockToolbar` provide renderer-owned toolbar state for block conversion and block-range actions. The toolbar reads the active block and selected sibling range from `DocumentSelection`; it does not store toolbar state in core or mutate document data directly.

Supported conversion targets are paragraph, heading levels 1/2/3, quote, and code. Rich-text targets preserve valid `InlineContent`; code conversion flattens rich inline content to plain text and falls back to an empty string when content cannot be preserved safely. Conversions keep the existing block id and leave children unchanged through the core command.

Range actions currently expose delete, duplicate, move up, and move down. Duplicate and move dispatch atomic core commands (`duplicateBlocks` / `moveBlocks`) so multi-block operations remain one transaction and one undo step. Duplicate accepts a caller-provided id factory for deterministic downstream ids; otherwise the React renderer creates stable `-copy` ids without inspecting DOM selection.

## Block drag

`VirtualBlockList` wraps top-level rendered blocks with dnd-kit sortable state and dispatches `moveBlock` on drag end. Reorder stays constrained to the rendered root list in V1; nested indent/outdent is left to later command/UI work.

Block UI can call `useBlockDragHandle` to wire a Grip-style button as the dnd-kit activator without mutating document children directly.
