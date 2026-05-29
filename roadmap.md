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

- Selected-block clipboard V1 is in place: React serializes block/range selection as internal
  JSON plus `text/plain`, and paste prefers the internal Vetra payload before plain text.
- Atomic block fragment paste is in place: recursive per-block paste insertion has been replaced
  with a core command so multi-block/subtree paste is one transaction and one history step.
- Range paste replacement is in place for block ranges: paste can replace selected sibling blocks
  before focusing the inserted fragment.
- Browser `text/html` paste is routed through `@vetra/import-html` from `@vetra/react`.
  Core must remain framework-agnostic and must not parse HTML or read browser clipboard events.
- Multi-block duplicate and move commands are in place as atomic core commands.
- Range toolbar actions are in place for delete, duplicate, move up, and move down.
- Add toolbar actions for copy, cut, and multi-block convert.

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

The playground, basic block coverage, inspector, structured clipboard V1, atomic fragment paste,
range paste replacement, browser HTML paste, atomic multi-block duplicate/move commands, and the
first range toolbar actions have landed. The next iteration should fill the remaining range action
UI and continue hardening external-format fidelity.

1. Complete range action UI and commands for multi-block editing.
   - Done: toolbar actions for delete, duplicate, move up, and move down.
   - Done: multi-block duplicate and move are atomic core commands, not repeated UI dispatch loops.
   - Remaining: toolbar actions for copy, cut, and multi-block convert.
   - Remaining: make range delete selection update atomic with the delete command.
   - Every document mutation still goes through core commands.
2. Improve HTML and inline content fidelity.
   - Preserve marks, links, and inline code where the adapter model supports it.
   - Keep sanitization and external format parsing out of `@vetra/core`.
3. Harden block fragment editing semantics.
   - Input should describe root block ids, blocks, and children without DOM, React, Lexical, or
     browser clipboard types.
   - Fragment insertion/replacement must remain one transaction and one history step.
   - Invalid fragments must fail before mutating document state.
4. Keep `@vetra/react` paste orchestration focused on browser clipboard concerns.
   - React owns `copy` / `cut` / `paste` event handling and MIME priority.
   - Paste priority is Vetra internal block MIME, then `text/html` via an adapter, then
     `text/plain`.
   - Range paste replacement should stay derived from `DocumentSelection`, not DOM selection.
5. Gate this round with focused coverage.
   - Multi-block duplicate/move unit tests are in place.
   - Keep React tests covering selection replacement, clipboard MIME priority, and focus after
     paste.
   - Keep E2E coverage for structured multi-block copy/cut/paste, range paste replacement, and
     browser HTML paste.
   - Storybook acceptance coverage exists for the first range toolbar actions.
