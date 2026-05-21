export type CommandErrorCode =
  | 'blockAlreadyExists'
  | 'blockNotFound'
  | 'cannotConvertRoot'
  | 'cannotDeleteRoot'
  | 'cannotDuplicateRoot'
  | 'cannotMoveRoot'
  | 'invalidBlockType'
  | 'invalidDuplicateSubtree'
  | 'invalidIndex'
  | 'invalidMergeTarget'
  | 'invalidParent'
  | 'invalidSelection'
  | 'invalidSplitTarget'

export interface CommandError {
  readonly code: CommandErrorCode
  readonly message: string
}
