import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@vetra/playground/App'
import '@vetra/playground/styles.css'

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Vetra playground root element was not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
