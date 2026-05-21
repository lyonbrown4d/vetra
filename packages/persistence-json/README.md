# @vetra/persistence-json

Versioned JSON persistence adapter for Vetra internal document state.

This package serializes `DocumentState`, `InlineContent`, block props, and block tree data. It does not persist Lexical editor state or external Markdown/HTML/plain-text source as the primary document format.

## Format

Serialized documents use the Vetra internal JSON envelope:

```ts
interface SerializedDocument {
  format: 'virtual-block-editor'
  version: number
  document: DocumentState
}
```

`serializeDocument` and `stringifyDocument` always emit `CURRENT_SERIALIZED_DOCUMENT_VERSION`.
`deserializeDocument`, `parseDocument`, and `migrateSerializedDocument` run older supported envelopes through the migration pipeline before returning a `DocumentState`.

## Migration

The current serialized document version is `1`. Legacy version `0` is accepted for compatibility and migrated by backfilling the internal `DocumentState.version` field when older payloads do not contain it.

Unknown future versions return an `unsupportedVersion` error. Non-Vetra envelopes return an `unsupportedFormat` error. Malformed envelopes or invalid document trees return an `invalidDocument` error.
