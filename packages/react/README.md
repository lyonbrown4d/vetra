# @vetra/react

Official React renderer for Vetra.

This package owns React context, hooks, block rendering, and virtualized rendering with TanStack Virtual. It consumes `@vetra/core` through the command system and does not mutate document state directly.

The renderer exposes block-level selector hooks such as `useBlock`, active lifecycle helpers such as `useActiveBlockLifecycle` / `useSelectBlock`, and debug hooks such as `useMountedBlockCount` for future virtualization and performance tests.
