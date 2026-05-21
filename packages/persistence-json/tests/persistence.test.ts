import { describe, expect, it } from 'vitest'
import { createDocument, createTextInlineContent, type ParagraphBlock } from '@vetra/core'
import {
  CURRENT_SERIALIZED_DOCUMENT_VERSION,
  LEGACY_SERIALIZED_DOCUMENT_VERSION,
  deserializeDocument,
  migrateSerializedDocument,
  parseDocument,
  serializeDocument,
  stringifyDocument,
  VETRA_JSON_FORMAT,
  type MigrationError,
} from '@vetra/persistence-json'

function paragraph(id: string): ParagraphBlock {
  return {
    id,
    type: 'paragraph',
    content: createTextInlineContent('Persisted'),
  }
}

describe('@vetra/persistence-json', () => {
  it('serializes the internal document format with a versioned format marker', () => {
    const document = createDocument({ id: 'doc', blocks: [paragraph('block-a')] })
    const serialized = serializeDocument(document)

    expect(serialized.format).toBe(VETRA_JSON_FORMAT)
    expect(serialized.version).toBe(CURRENT_SERIALIZED_DOCUMENT_VERSION)
    expect(serialized.document.blocks['block-a']?.type).toBe('paragraph')
  })

  it('migrates legacy v0 documents through the deserialize pipeline', () => {
    const document = createDocument({ id: 'doc', blocks: [paragraph('block-a')] })
    const legacyDocument = {
      id: document.id,
      rootId: document.rootId,
      blocks: document.blocks,
      children: document.children,
    }
    const legacySerialized = {
      format: VETRA_JSON_FORMAT,
      version: LEGACY_SERIALIZED_DOCUMENT_VERSION,
      document: legacyDocument,
    }

    const migrated = migrateSerializedDocument(legacySerialized)
    expect(migrated.ok).toBe(true)
    if (!migrated.ok) {
      return
    }

    expect(migrated.value.version).toBe(CURRENT_SERIALIZED_DOCUMENT_VERSION)
    expect(migrated.value.document.version).toBe(1)
    expect(migrated.value.document.blocks['block-a']).toEqual(document.blocks['block-a'])

    const deserialized = deserializeDocument(legacySerialized)
    expect(deserialized.ok).toBe(true)
    if (!deserialized.ok) {
      return
    }

    expect(deserialized.value.version).toBe(1)
    expect(deserialized.value.blocks['block-a']?.type).toBe('paragraph')
  })

  it('roundtrips through JSON', () => {
    const document = createDocument({ id: 'doc', blocks: [paragraph('block-a')] })
    const parsed = parseDocument(stringifyDocument(document))

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }

    expect(parsed.value).toEqual(document)
  })

  it('does not introduce Lexical-specific persistence fields', () => {
    const document = createDocument({ id: 'doc', blocks: [paragraph('block-a')] })
    const json = stringifyDocument(document)

    expect(json).not.toContain('lexical')
    expect(json).not.toContain('editorState')
    expect(json).not.toContain('LexicalEditor')
  })

  it('rejects unsupported serialized formats', () => {
    const document = createDocument({ id: 'doc', blocks: [paragraph('block-a')] })
    const result = deserializeDocument({
      format: 'markdown',
      version: CURRENT_SERIALIZED_DOCUMENT_VERSION,
      document,
    })

    expectErrorCode(result, 'unsupportedFormat')
  })

  it('rejects unknown future serialized versions', () => {
    const document = createDocument({ id: 'doc', blocks: [paragraph('block-a')] })
    const result = deserializeDocument({
      format: VETRA_JSON_FORMAT,
      version: CURRENT_SERIALIZED_DOCUMENT_VERSION + 1,
      document,
    })

    expectErrorCode(result, 'unsupportedVersion')
  })

  it('rejects malformed serialized document payloads', () => {
    const result = deserializeDocument({
      format: VETRA_JSON_FORMAT,
      version: CURRENT_SERIALIZED_DOCUMENT_VERSION,
      document: {
        id: 'doc',
        version: 1,
        rootId: 'missing-root',
        blocks: {},
        children: {},
      },
    })

    expectErrorCode(result, 'invalidDocument')
  })
})

function expectErrorCode(
  result: ReturnType<typeof deserializeDocument>,
  code: MigrationError['code'],
): void {
  expect(result.ok).toBe(false)
  if (result.ok) {
    return
  }

  expect(result.error.code).toBe(code)
}
