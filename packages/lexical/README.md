# @vetra/lexical

Lexical adapter for Vetra active block inline editing.

Lexical is scoped to the active block editor lifecycle. It does not own the full `DocumentState`, and core never imports Lexical types.

`LexicalBlockEditor` exposes command bridge callbacks for active-block structural
intents such as split, merge backward, and commit. Callback payloads use
`@vetra/core` `InlineContent` plus plain intent objects, never Lexical editor
state or Lexical node types.
