import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ViewerErrorOverlay,
  ViewerLoadingOverlay,
} from '../components/ViewerOverlays'
import type { ViewerData } from '../data/client'
import { ViewerQueryProvider } from '../data/ViewerQueryProvider'
import { useViewerData } from '../data/query'
import { Projection } from '../lib/geo'
import { SceneErrorBoundary } from '../scene/SceneErrorBoundary'
import { ViewerScene } from '../scene/ViewerScene'
import { useViewerUrlState } from '../state/useViewerUrlState'
import { useViewerStore } from '../state/viewerStore'

interface SceneViewProps {
  data: ViewerData
  selectedLines: ReadonlySet<string>
  xray: boolean
  onError: (message: string) => void
}

function SceneView({ data, selectedLines, xray, onError }: SceneViewProps) {
  const projection = useMemo(
    () => new Projection(data.manifest),
    [data.manifest],
  )

  return (
    <SceneErrorBoundary onError={onError}>
      <ViewerScene
        manifest={data.manifest}
        stations={data.stations}
        network={data.network}
        heights={data.heights}
        projection={projection}
        selectedLines={selectedLines}
        xray={xray}
      />
    </SceneErrorBoundary>
  )
}

function ViewerContent() {
  const viewerData = useViewerData()
  const data = viewerData.data
  const lineIds = useMemo(
    () => data?.network.lines.map((line) => line.id) ?? [],
    [data],
  )
  const urlState = useViewerUrlState(lineIds)
  const requestFocus = useViewerStore((state) => state.requestFocus)
  const sceneReady = useViewerStore((state) => state.sceneReady)
  const [sceneError, setSceneError] = useState<string | null>(null)
  const initialFocusRequested = useRef(false)

  useEffect(() => {
    if (initialFocusRequested.current || !data || !sceneReady) {
      return
    }
    initialFocusRequested.current = true

    const stationId = urlState.selectedStationId
    if (stationId && data.stations.some((station) => station.id === stationId)) {
      requestFocus(stationId)
    }
  }, [data, requestFocus, sceneReady, urlState.selectedStationId])

  if (viewerData.isPending) {
    return <ViewerLoadingOverlay />
  }

  if (viewerData.isError) {
    const message =
      viewerData.error instanceof Error
        ? viewerData.error.message
        : String(viewerData.error)
    return <ViewerErrorOverlay message={message} />
  }

  if (!data) {
    return <ViewerErrorOverlay message="No viewer data returned." />
  }

  return (
    <main className="fixed inset-0 bg-bg">
      {sceneError ? null : (
        <SceneView
          data={data}
          selectedLines={urlState.selectedLines}
          xray={urlState.xray}
          onError={setSceneError}
        />
      )}
      {!sceneReady && !sceneError ? <ViewerLoadingOverlay /> : null}
      {sceneError ? <ViewerErrorOverlay message={sceneError} /> : null}
    </main>
  )
}

export function ViewerRoute() {
  return (
    <ViewerQueryProvider>
      <ViewerContent />
    </ViewerQueryProvider>
  )
}
