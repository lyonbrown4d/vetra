# @vetra/import-html

HTML import adapter for Vetra.

This package converts external HTML into Vetra `DocumentState`. It depends only on `@vetra/core`;
core does not import this package, and no renderer or Lexical types are exposed.

Current MVP support:

- `<h1>` through `<h6>` -> `heading`
- `<p>` and ordinary text -> `paragraph`
- `<blockquote>` -> `quote`
- `<hr>` -> `divider`
- `<pre><code class="language-xxx">` and block `<code>` -> `code`

Inline rich text is flattened into Vetra `InlineContent` text for now. Dangerous or executable
content such as `script`, `style`, `template`, `noscript`, `iframe`, `object`, and `embed` is
ignored during import rather than persisted into the document model.
