import { lazy, Suspense } from 'react'

const ViewerRoute = lazy(() =>
  import('./ViewerRoute').then((module) => ({ default: module.ViewerRoute })),
)

function RouteFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg font-sans text-[10px] tracking-[0.14em] text-muted uppercase">
      Loading viewer...
    </main>
  )
}

export function LazyViewerRoute() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <ViewerRoute />
    </Suspense>
  )
}
