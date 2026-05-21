import {
  err,
  ok,
  validateDocument,
  type DocBlock,
  type DocumentState,
  type Result,
} from '@vetra/core'
import {
  CURRENT_SERIALIZED_DOCUMENT_VERSION,
  INITIAL_SERIALIZED_DOCUMENT_VERSION,
  LEGACY_SERIALIZED_DOCUMENT_VERSION,
  VETRA_JSON_FORMAT,
  type SerializedDocument,
} from './serializedDocument'

export interface MigrationError {
  readonly code: 'unsupportedFormat' | 'unsupportedVersion' | 'invalidDocument'
  readonly message: string
}

interface VersionedSerializedDocument {
  readonly format: typeof VETRA_JSON_FORMAT
  readonly version: number
  readonly document: unknown
}

type MigrationStep = (
  serialized: VersionedSerializedDocument,
) => Result<VersionedSerializedDocument, MigrationError>

const MIGRATIONS: Readonly<Record<number, MigrationStep | undefined>> = {
  [LEGACY_SERIALIZED_DOCUMENT_VERSION]: migrateV0ToV1,
}

export function migrateSerializedDocument(
  value: unknown,
): Result<SerializedDocument, MigrationError> {
  const envelope = readSerializedDocumentEnvelope(value)

  if (!envelope.ok) {
    return envelope
  }

  let migrated = envelope.value

  while (migrated.version < CURRENT_SERIALIZED_DOCUMENT_VERSION) {
    const migration = MIGRATIONS[migrated.version]

    if (migration === undefined) {
      return unsupportedVersion(migrated.version)
    }

    const next = migration(migrated)
    if (!next.ok) {
      return next
    }

    if (next.value.version <= migrated.version) {
      return err({
        code: 'invalidDocument',
        message: `Migration from version "${String(migrated.version)}" did not advance the document version.`,
      })
    }

    migrated = next.value
  }

  if (migrated.version !== CURRENT_SERIALIZED_DOCUMENT_VERSION) {
    return unsupportedVersion(migrated.version)
  }

  if (!isDocumentState(migrated.document)) {
    return err({
      code: 'invalidDocument',
      message: 'Serialized document payload is missing a valid DocumentState object.',
    })
  }

  const validation = validateDocument(migrated.document)
  if (!validation.ok) {
    return err({
      code: 'invalidDocument',
      message: `Serialized document tree is invalid: ${validation.error
        .map((error) => error.code)
        .join(', ')}.`,
    })
  }

  return ok({
    format: VETRA_JSON_FORMAT,
    version: CURRENT_SERIALIZED_DOCUMENT_VERSION,
    document: migrated.document,
  })
}

function readSerializedDocumentEnvelope(
  value: unknown,
): Result<VersionedSerializedDocument, MigrationError> {
  if (!isRecord(value)) {
    return err({
      code: 'invalidDocument',
      message: 'Serialized document must be an object.',
    })
  }

  if (value.format !== VETRA_JSON_FORMAT) {
    return err({
      code: 'unsupportedFormat',
      message: `Unsupported document format "${String(value.format)}".`,
    })
  }

  if (!isSafeInteger(value.version)) {
    return err({
      code: 'invalidDocument',
      message: 'Serialized document version must be an integer.',
    })
  }

  if (!isRecord(value.document)) {
    return err({
      code: 'invalidDocument',
      message: 'Serialized document payload is missing a valid document object.',
    })
  }

  return ok({
    format: VETRA_JSON_FORMAT,
    version: value.version,
    document: value.document,
  })
}

function migrateV0ToV1(
  serialized: VersionedSerializedDocument,
): Result<VersionedSerializedDocument, MigrationError> {
  if (!isRecord(serialized.document)) {
    return err({
      code: 'invalidDocument',
      message: 'Serialized document payload is missing a valid document object.',
    })
  }

  const documentVersion = serialized.document.version
  if (documentVersion !== undefined && !isSafeInteger(documentVersion)) {
    return err({
      code: 'invalidDocument',
      message: 'Legacy document version must be an integer when present.',
    })
  }

  return ok({
    format: VETRA_JSON_FORMAT,
    version: INITIAL_SERIALIZED_DOCUMENT_VERSION,
    document: {
      ...serialized.document,
      version: documentVersion ?? 1,
    },
  })
}

function unsupportedVersion(version: number): Result<never, MigrationError> {
  return err({
    code: 'unsupportedVersion',
    message: `Unsupported document version "${String(version)}".`,
  })
}

function isDocumentState(value: unknown): value is DocumentState {
  if (!isRecord(value)) {
    return false
  }

  if (
    typeof value.id !== 'string' ||
    !isSafeInteger(value.version) ||
    typeof value.rootId !== 'string' ||
    !isBlockMap(value.blocks) ||
    !isChildrenMap(value.children)
  ) {
    return false
  }

  if (value.meta !== undefined && !isRecord(value.meta)) {
    return false
  }

  return true
}

function isBlockMap(value: unknown): value is Readonly<Record<string, DocBlock>> {
  if (!isRecord(value)) {
    return false
  }

  return Object.values(value).every(isDocBlock)
}

function isDocBlock(value: unknown): value is DocBlock {
  if (!isRecord(value)) {
    return false
  }

  if (typeof value.id !== 'string' || typeof value.type !== 'string') {
    return false
  }

  if (value.props !== undefined && !isRecord(value.props)) {
    return false
  }

  if (value.createdAt !== undefined && typeof value.createdAt !== 'number') {
    return false
  }

  if (value.updatedAt !== undefined && typeof value.updatedAt !== 'number') {
    return false
  }

  return true
}

function isChildrenMap(value: unknown): value is Readonly<Record<string, readonly string[]>> {
  if (!isRecord(value)) {
    return false
  }

  return Object.values(value).every(
    (childIds) =>
      Array.isArray(childIds) && childIds.every((childId) => typeof childId === 'string'),
  )
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
