# @vetra/react

Official React renderer for Vetra.

This package owns React context, hooks, block rendering, and virtualized rendering with TanStack Virtual. It consumes `@vetra/core` through the command system and does not mutate document state directly.

The renderer exposes block-level selector hooks such as `useBlock`, active lifecycle helpers such as `useActiveBlockLifecycle` / `useSelectBlock`, slash menu primitives such as `SlashMenu` / `useSlashMenu`, and debug hooks such as `useMountedBlockCount` for future virtualization and performance tests.

## Paste

`createPasteHandler` and `usePasteHandler` provide renderer-owned paste orchestration. The default strategy treats clipboard text as plain text through `@vetra/import-plain-text`, converts it to paragraph blocks, and dispatches core `insertBlockBefore` / `insertBlockAfter` commands against a caller-provided reference block. The handler does not read DOM selection.

Markdown remains opt-in: callers can pass an explicit `PasteBlockStrategy`, or wrap a document importer with `createDocumentPasteStrategy`, instead of relying on automatic format guessing.

## Block toolbar

`useBlockToolbar` and `BlockToolbar` provide the renderer-owned toolbar state for basic block conversion. The toolbar reads the active block from `DocumentSelection` and dispatches `convertBlockType`; it does not store toolbar state in core or mutate document data directly.

Supported conversion targets are paragraph, heading levels 1/2/3, quote, and code. Rich-text targets preserve valid `InlineContent`; code conversion flattens rich inline content to plain text and falls back to an empty string when content cannot be preserved safely. Conversions keep the existing block id and leave children unchanged through the core command.
