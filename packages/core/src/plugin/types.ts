import type { BlockPlugin } from '../block/schema'

export interface VetraPlugin {
  readonly name: string
  readonly blocks?: readonly BlockPlugin[]
}
