import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './styles/reset.css'
import './styles/variables.css'
import './styles/globals.css'
import './styles/components.css'

import App from './App'
import { registerDownloadServiceWorker } from './services/serviceWorker.service'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

registerDownloadServiceWorker().catch(() => {})
