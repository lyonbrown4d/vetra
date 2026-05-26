# @vetra/export-html

HTML export adapter for Vetra.

This package converts Vetra `DocumentState` into a safe external HTML string. It depends only on
`@vetra/core`; core does not import this package, and no renderer or Lexical types are exposed.

Current MVP support:

- `paragraph` -> `<p>`
- `heading` -> `<h1>` through `<h6>`
- `quote` -> `<blockquote>`
- `divider` -> `<hr>`
- `code` -> `<pre><code class="language-xxx">`

Inline content escapes text and supports `bold`, `italic`, `underline`, `strike`, `code`, `link`,
`mention`, and `inline-code`. Links are emitted only when their `href` uses a safe protocol or a
relative URL. Unknown blocks degrade to text fallback or an unsupported-block HTML comment.
