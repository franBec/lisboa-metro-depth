import { createBrowserRouter } from 'react-router'
import { LandingRoute } from './routes/LandingRoute'
import { LazyViewerRoute } from './routes/LazyViewerRoute'
import { MethodRoute } from './routes/MethodRoute'
import { NotFoundRoute } from './routes/NotFoundRoute'

export const appRoutes = [
  { path: '/', element: <LandingRoute /> },
  { path: '/maps/lisboa', element: <LazyViewerRoute /> },
  { path: '/maps/lisboa/method', element: <MethodRoute /> },
  { path: '*', element: <NotFoundRoute /> },
]

export function createAppRouter() {
  return createBrowserRouter(appRoutes)
}
