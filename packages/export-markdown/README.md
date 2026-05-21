# @vetra/export-markdown

Markdown export adapter for Vetra.

This package converts Vetra's internal `DocumentState` into an external Markdown string. The
conversion policy lives in this adapter package, not in `@vetra/core`; core does not know about
Markdown rendering rules.

Current MVP support:

- `heading` -> ATX headings
- `paragraph` -> plain paragraph text
- `quote` -> simple block quotes
- `divider` -> `---`
- `code` -> fenced code blocks

Unknown blocks never crash export. If an unknown block contains text-like content, that text is
emitted. Otherwise the exporter emits an HTML comment style placeholder.

Inline rich text is currently flattened to plain text. This conservative behavior is an adapter
strategy and can evolve without changing core.
