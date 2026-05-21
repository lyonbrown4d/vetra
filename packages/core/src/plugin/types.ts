import type { BlockPlugin } from '@vetra/core/block/schema'

export interface VetraPlugin {
  readonly name: string
  readonly blocks?: readonly BlockPlugin[]
}
