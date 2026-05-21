# @vetra/import-markdown

Markdown import adapter for Vetra.

This package converts an external Markdown string into Vetra's internal `DocumentState`. The
conversion policy lives in this adapter package, not in `@vetra/core`; core remains unaware of
Markdown syntax and parser choices.

Current MVP support:

- ATX headings (`#` through `######`) -> `heading`
- Paragraph text -> `paragraph`
- Simple block quotes (`> text`) -> `quote`
- Thematic breaks (`---`, `***`, `___`) -> `divider`
- Fenced code blocks using backticks or tildes -> `code`

Unsupported or complex Markdown is deliberately degraded to paragraph/plain text instead of
throwing. This is an adapter strategy and can evolve independently from the core runtime.

No external Markdown parser dependency is used in the MVP.
