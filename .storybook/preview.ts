import type { Preview } from '@storybook/react'
import '@vetra/playground/styles.css'

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'Vetra canvas',
      values: [
        { name: 'Vetra canvas', value: '#f8fafc' },
        { name: 'Document white', value: '#ffffff' },
        { name: 'Muted workspace', value: '#f4f4f5' },
      ],
    },
    controls: {
      expanded: true,
    },
    layout: 'fullscreen',
  },
}

export default preview
