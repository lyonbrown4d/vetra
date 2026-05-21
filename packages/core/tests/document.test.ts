import { describe, expect, it } from 'vitest'
import {
  createTextInlineContent,
  normalizeDocument,
  validateDocument,
  type DocBlock,
  type DocumentState,
  type ParagraphBlock,
} from '../src'

function paragraph(id: string, text = id): ParagraphBlock {
  return {
    id,
    type: 'paragraph',
    content: createTextInlineContent(text),
  }
}

function errorCodes(result: ReturnType<typeof validateDocument>): readonly string[] {
  if (result.ok) {
    return []
  }

  return result.error.map((error) => error.code)
}

describe('document validation', () => {
  it('reports invalid tree invariants with clear error codes', () => {
    const document: DocumentState = {
      id: 'doc',
      version: 1,
      rootId: 'root',
      blocks: {
        root: { id: 'root', type: 'root' },
        'key-mismatch': paragraph('actual-id'),
        duplicateA: paragraph('duplicate-id'),
        duplicateB: paragraph('duplicate-id'),
        orphan: paragraph('orphan'),
      },
      children: {
        root: ['key-mismatch', 'key-mismatch', 'missing-child'],
        'key-mismatch': ['root'],
        duplicateA: [],
        duplicateB: [],
        missingParent: ['root'],
      },
    }

    const result = validateDocument(document)

    expect(result.ok).toBe(false)
    expect(errorCodes(result)).toEqual(
      expect.arrayContaining([
        'blockIdMismatch',
        'duplicateBlockId',
        'missingChildren',
        'unknownChildrenParent',
        'missingChildBlock',
        'duplicateChildReference',
        'rootHasParent',
        'cycleDetected',
        'orphanBlock',
      ]),
    )
  })

  it('accepts a valid rooted tree', () => {
    const document: DocumentState = {
      id: 'doc',
      version: 1,
      rootId: 'root',
      blocks: {
        root: { id: 'root', type: 'root' },
        parent: paragraph('parent'),
        child: paragraph('child'),
      },
      children: {
        root: ['parent'],
        parent: ['child'],
        child: [],
      },
    }

    const result = validateDocument(document)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value.reachableBlockIds).toEqual(['root', 'parent', 'child'])
  })
})

describe('document normalization', () => {
  it('repairs tree wiring while preserving unknown block payloads and root id', () => {
    const customBlock: DocBlock = {
      id: 'custom',
      type: 'unknown-widget',
      props: { label: 'Keep me' },
      content: { opaque: true },
    }
    const document: DocumentState = {
      id: 'doc',
      version: 7,
      rootId: 'stable-root',
      blocks: {
        custom: customBlock,
        mismatch: paragraph('wrong-id'),
        'cycle-a': paragraph('cycle-a'),
        'cycle-b': paragraph('cycle-b'),
        orphan: paragraph('orphan'),
      },
      children: {
        'stable-root': ['custom', 'missing', 'custom', 'cycle-a'],
        custom: ['missing-grandchild'],
        'cycle-a': ['cycle-b'],
        'cycle-b': ['cycle-a'],
        ghostParent: ['custom'],
      },
    }

    const normalized = normalizeDocument(document)
    const validation = validateDocument(normalized.document)

    expect(validation.ok).toBe(true)
    expect(normalized.document.rootId).toBe('stable-root')
    expect(normalized.document.version).toBe(7)
    expect(normalized.document.blocks.custom).toEqual(customBlock)
    expect(normalized.document.blocks.mismatch?.id).toBe('mismatch')
    expect(normalized.document.children['stable-root']).toEqual([
      'custom',
      'cycle-a',
      'mismatch',
      'orphan',
    ])
    expect(normalized.document.children.custom).toEqual([])
    expect(normalized.document.children['cycle-b']).toEqual([])

    expect(normalized.changes.map((change) => change.code)).toEqual(
      expect.arrayContaining([
        'alignedBlockIdWithMapKey',
        'createdMissingRootBlock',
        'addedMissingChildrenArray',
        'removedUnknownChildrenParent',
        'removedMissingChildReference',
        'removedDuplicateChildReference',
        'removedCycleReference',
        'attachedOrphanBlock',
      ]),
    )
  })
})
