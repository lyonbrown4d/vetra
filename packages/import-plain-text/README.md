# @vetra/import-plain-text

Plain text import adapter for Vetra.

This package owns the external plain text splitting strategy and converts text into Vetra `DocumentState` with paragraph blocks. It depends only on `@vetra/core`; core does not import this package.

Supported strategies:

- `splitBy: 'paragraph'` groups non-empty lines and separates paragraphs with blank lines.
- `splitBy: 'line'` creates one paragraph block per source line, preserving empty lines as empty paragraphs.

Callers can provide `documentId`, `rootId`, `meta`, and `idFactory` to keep imported documents stable in their own systems.
