export interface LexicalBlockEditorCompositionState {
  readonly isComposing: boolean
}

const structuralKeys = new Set(['Backspace', 'Delete', 'Enter'])

export function canRunStructuralKeyCommand(state: LexicalBlockEditorCompositionState): boolean {
  return !state.isComposing
}

export function isStructuralKey(key: string): boolean {
  return structuralKeys.has(key)
}
