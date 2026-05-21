import type { DocumentState, Result } from '@vetra/core'
import { migrateSerializedDocument, type MigrationError } from '@vetra/persistence-json/migration'

export function deserializeDocument(value: unknown): Result<DocumentState, MigrationError> {
  const migrated = migrateSerializedDocument(value)

  if (!migrated.ok) {
    return migrated
  }

  return {
    ok: true,
    value: migrated.value.document,
  }
}

export function parseDocument(json: string): Result<DocumentState, MigrationError> {
  try {
    return deserializeDocument(JSON.parse(json) as unknown)
  } catch (cause) {
    return {
      ok: false,
      error: {
        code: 'invalidDocument',
        message: cause instanceof Error ? cause.message : 'Document JSON is invalid.',
      },
    }
  }
}
