import type { Meta, StoryObj } from '@storybook/react'
import { basicBlocks } from '@vetra/blocks-basic/react'
import { createHeadingBlock, createParagraphBlock } from '@vetra/blocks-basic'
import { createDocument } from '@vetra/core'
import { EditorRoot } from '@vetra/react'

const meta = {
  title: 'Vetra/EditorRoot',
  component: EditorRoot,
} satisfies Meta<typeof EditorRoot>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    blocks: basicBlocks,
    initialValue: createDocument({
      id: 'storybook-default',
      blocks: [
        createHeadingBlock('story-title', 1, 'Vetra Storybook'),
        createParagraphBlock(
          'story-body',
          'Readonly blocks switch to an active editor when selected.',
        ),
      ],
    }),
  },
}
