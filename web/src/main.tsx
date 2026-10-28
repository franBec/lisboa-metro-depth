import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { createAppRouter } from './routes'
import './styles/index.css'
import './styles/landing.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('missing #root element')
}

const app = (
  <StrictMode>
    <RouterProvider router={createAppRouter()} />
  </StrictMode>
)

if (container.hasChildNodes()) {
  hydrateRoot(container, app)
} else {
  createRoot(container).render(app)
}
