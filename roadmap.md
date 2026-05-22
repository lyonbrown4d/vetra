# Vetra Roadmap

Vetra 的核心路线是把大文档编辑拆成三层稳定职责：

- `@vetra/core` 维护 framework-agnostic document model、command、selection、history。
- `@vetra/react` 只把 core 状态投影成可交互 UI，并通过 command 修改文档。
- `@vetra/lexical` 只负责 active block 的 inline editing，不拥有整篇文档。

## Selection And Virtualization

虚拟渲染后，浏览器 DOM Selection 只能覆盖已挂载节点，不能表达不可见 block。
因此 Vetra 必须把常见编辑器 selection UI 建立在 `DocumentSelection` 上，
再由 renderer 自己绘制高亮。

### Phase 1: Block Selection Foundation

- Add core helpers for block and sibling range selection membership.
- Render selected state for mounted virtual blocks.
- Keep selected state stable when a selected block scrolls out and back into the viewport.
- Add Shift+Click and Shift+Arrow block range extension.
- Add batch block deletion so range delete is one command and one history step.

### Phase 2: Clipboard And Multi-Block Editing

- Add internal selected-block serialization for copy/cut/paste.
- Write clipboard payloads as internal JSON plus plain text and optional Markdown.
- Prefer internal JSON on paste, then fall back to plain text/import adapters.
- Add multi-block duplicate and move commands.
- Add range toolbar actions for delete, copy, duplicate, convert, and move.

### Phase 3: Inline Selection Bridge

- Define explicit transition rules between Lexical text selection and block selection.
- Keep IME-safe Enter, Backspace, blur, and unmount behavior.
- Preserve InlineContent roundtrip for links, mentions, inline code, and marks.
- Ensure multi-block selection never mounts extra Lexical editors.

### Phase 4: Virtualization Hardening

- Introduce parent index/cache for large documents.
- Avoid whole-document React subscriptions for visible block lists.
- Add `scrollBlockIntoView` and `scrollSelectionIntoView`.
- Position selection toolbar from visible anchors with fallback when range endpoints are offscreen.
- Measure selection changes against 1k, 10k, and 50k fixtures.

### Phase 5: Beta Quality Gates

- Storybook coverage for each basic block: readonly, active, selected, range selected,
  long content, error fallback, narrow container.
- E2E coverage for select all, Shift+Click, Shift+Arrow, range delete, undo,
  copy/cut/paste, and virtual scroll persistence.
- Performance reports for mounted block count, active editor count, input latency,
  range selection cost, and delete/move latency.

## Current Iteration

The first iteration focuses on five items:

1. Core selection helpers.
2. Block range highlight for mounted virtual blocks.
3. Shift+Click and Shift+Arrow block range selection.
4. Batch `deleteBlocks` command for one-step history.
5. Unit, Storybook, and E2E coverage for selection behavior.
