import type { DocumentState } from '@vetra/core'

export const VETRA_JSON_FORMAT = 'virtual-block-editor' as const
export const LEGACY_SERIALIZED_DOCUMENT_VERSION = 0
export const INITIAL_SERIALIZED_DOCUMENT_VERSION = 1
export const CURRENT_SERIALIZED_DOCUMENT_VERSION = 1
export const SUPPORTED_SERIALIZED_DOCUMENT_VERSIONS = [
  LEGACY_SERIALIZED_DOCUMENT_VERSION,
  CURRENT_SERIALIZED_DOCUMENT_VERSION,
] as const

export type SerializedDocumentVersion = (typeof SUPPORTED_SERIALIZED_DOCUMENT_VERSIONS)[number]

export interface SerializedDocument {
  readonly format: typeof VETRA_JSON_FORMAT
  readonly version: number
  readonly document: DocumentState
}
