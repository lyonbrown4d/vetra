import type { DocumentState } from '@vetra/core'
import {
  CURRENT_SERIALIZED_DOCUMENT_VERSION,
  VETRA_JSON_FORMAT,
  type SerializedDocument,
} from './serializedDocument'

export function serializeDocument(document: DocumentState): SerializedDocument {
  return {
    format: VETRA_JSON_FORMAT,
    version: CURRENT_SERIALIZED_DOCUMENT_VERSION,
    document,
  }
}

export function stringifyDocument(document: DocumentState, space = 2): string {
  return JSON.stringify(serializeDocument(document), null, space)
}
