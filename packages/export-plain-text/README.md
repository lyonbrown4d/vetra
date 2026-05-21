# @vetra/export-plain-text

Plain text export adapter for Vetra.

This package converts Vetra `DocumentState` into external plain text. It depends only on `@vetra/core`; core does not import this package, and no Lexical or renderer-specific types are exposed.

Default block behavior:

- `paragraph`, `heading`, and `quote` export their `InlineContent` text.
- `code` exports its string content without fences.
- `divider` exports `---`.
- `image` prefers `alt`, then `caption`, then `src` when present.
- Unknown blocks degrade to textual content, common text props, or an unsupported-block marker.

Callers can customize `blockSeparator` and `unknownBlockFallback` for product-specific text output.
