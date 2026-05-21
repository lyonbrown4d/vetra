# @vetra/core

Framework-agnostic Vetra runtime package.

This package owns:

- `DocumentState`
- block tree helpers
- command dispatch
- selection model
- transaction shape
- runtime store with document undo/redo history
- plugin contracts

It must not depend on React, DOM, Lexical, TanStack Virtual, or import/export format parsers.
