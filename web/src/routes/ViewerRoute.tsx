import { useEffect, useMemo, useRef } from 'react'
import { InfoPage } from '../components/InfoPage'
import {
  ViewerErrorOverlay,
  ViewerLoadingOverlay,
} from '../components/ViewerOverlays'
import { ViewerQueryProvider } from '../data/ViewerQueryProvider'
import { useViewerData } from '../data/query'
import { useViewerUrlState } from '../state/useViewerUrlState'
import { useViewerStore } from '../state/viewerStore'

function ViewerContent() {
  const viewerData = useViewerData()
  const data = viewerData.data
  const lineIds = useMemo(
    () => data?.network.lines.map((line) => line.id) ?? [],
    [data],
  )
  const urlState = useViewerUrlState(lineIds)
  const requestFocus = useViewerStore((state) => state.requestFocus)
  const initialFocusRequested = useRef(false)

  useEffect(() => {
    if (initialFocusRequested.current || !data) {
      return
    }
    initialFocusRequested.current = true

    const stationId = urlState.selectedStationId
    if (stationId && data.stations.some((station) => station.id === stationId)) {
      requestFocus(stationId)
    }
  }, [data, requestFocus, urlState.selectedStationId])

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

  const platformCount = data.stations.reduce(
    (total, station) => total + station.platforms.length,
    0,
  )
  const segmentCount = data.network.lines.reduce(
    (total, line) => total + line.segments.length,
    0,
  )
  const lineSummary = urlState.selectedLines.size
    ? [...urlState.selectedLines].sort().join(',')
    : 'all'

  return (
    <InfoPage title="Lisboa">
      <p>
        The viewer data is loaded. The terrain, network, station panel, and
        camera follow in the next changes.
      </p>
      <ul>
        <li>Dataset: {data.manifest.dataset_version}</li>
        <li>
          Network: {data.stations.length} stations, {data.network.lines.length}{' '}
          lines, {platformCount} platforms, {segmentCount} segments
        </li>
        <li>
          Terrain: {data.manifest.terrain.width} x {data.manifest.terrain.height}
        </li>
        <li>
          URL state: lines {lineSummary}, station{' '}
          {urlState.selectedStationId ?? 'none'}, x-ray{' '}
          {urlState.xray ? 'on' : 'off'}
        </li>
      </ul>
    </InfoPage>
  )
}

export function ViewerRoute() {
  return (
    <ViewerQueryProvider>
      <ViewerContent />
    </ViewerQueryProvider>
  )
}
