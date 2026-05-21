# Vetra

Vetra is a virtualized block editor runtime for large documents.

The repository is intentionally split by responsibility:

- `@vetra/core`: framework-agnostic document runtime, commands, selection, store, and plugin contracts.
- `@vetra/react`: official React renderer and TanStack Virtual integration.
- `@vetra/lexical`: active block inline editing adapter.
- `@vetra/blocks-basic`: basic block definitions and React renderer bindings.
- `@vetra/persistence-json`: versioned JSON persistence for Vetra internal document state.
- `vetra-playground`: Vite playground app for downstream integration and runtime inspection
  (currently located at `packages/demo` until the Windows directory lock is cleared).

## Development

```bash
pnpm install
pnpm dev
```

Quality gates:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Storybook and browser tests:

```bash
pnpm storybook
pnpm test:e2e
pnpm test:perf
```

Core must not import React, DOM, Lexical, TanStack Virtual, or external format parsers. UI events are translated into Vetra commands before changing document structure.
