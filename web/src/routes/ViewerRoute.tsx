import { useEffect, useMemo, useRef, useState } from 'react'
import { ViewerHud } from '../components/hud/ViewerHud'
import {
  ViewerErrorOverlay,
  ViewerLoadingOverlay,
} from '../components/ViewerOverlays'
import type { ViewerData } from '../data/client'
import { ViewerQueryProvider } from '../data/ViewerQueryProvider'
import { useViewerData } from '../data/query'
import { Projection } from '../lib/geo'
import { LandmarkLabelOverlay } from '../scene/LandmarkLabelOverlay'
import { SceneErrorBoundary } from '../scene/SceneErrorBoundary'
import { StationLabelOverlay } from '../scene/StationLabelOverlay'
import { buildLandmarkVisuals } from '../scene/landmarkVisuals'
import { buildStationVisuals } from '../scene/stationVisuals'
import { ViewerScene } from '../scene/ViewerScene'
import { useViewerUrlState } from '../state/useViewerUrlState'
import { useViewerStore } from '../state/viewerStore'
import '../styles/viewer.css'

interface SceneViewProps {
  data: ViewerData
  selectedLines: ReadonlySet<string>
  selectedSegmentId: string | null
  xray: boolean
  onSelectStation: (stationId: string) => void
  onSelectSegment: (segmentId: string) => void
  onError: (message: string) => void
}

function SceneView({
  data,
  selectedLines,
  selectedSegmentId,
  xray,
  onSelectStation,
  onSelectSegment,
  onError,
}: SceneViewProps) {
  const projection = useMemo(
    () => new Projection(data.manifest),
    [data.manifest],
  )
  const verticalScale = useViewerStore((state) => state.verticalScale)
  const stationVisuals = useMemo(
    () =>
      buildStationVisuals(
        data.stations,
        data.network.lines,
        projection,
        verticalScale,
      ),
    [data.network.lines, data.stations, projection, verticalScale],
  )
  const landmarkVisuals = useMemo(
    () => buildLandmarkVisuals(data.landmarks, projection, verticalScale),
    [data.landmarks, projection, verticalScale],
  )
  const labelRefs = useRef(new Map<string, HTMLButtonElement>())
  const landmarkLabelRefs = useRef(new Map<string, HTMLButtonElement>())

  return (
    <>
      <SceneErrorBoundary onError={onError}>
        <ViewerScene
          manifest={data.manifest}
          stations={data.stations}
          network={data.network}
          heights={data.heights}
          projection={projection}
          selectedLines={selectedLines}
          selectedSegmentId={selectedSegmentId}
          xray={xray}
          stationVisuals={stationVisuals}
          landmarkVisuals={landmarkVisuals}
          labelRefs={labelRefs}
          landmarkLabelRefs={landmarkLabelRefs}
          onSelectStation={onSelectStation}
          onSelectSegment={onSelectSegment}
        />
      </SceneErrorBoundary>

      <StationLabelOverlay
        labels={stationVisuals.labels}
        selectedLines={selectedLines}
        labelRefs={labelRefs}
        onSelectStation={onSelectStation}
      />

      <LandmarkLabelOverlay
        labels={landmarkVisuals.labels}
        labelRefs={landmarkLabelRefs}
      />
    </>
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
  const [sectionLineChoice, setSectionLineChoice] = useState<{
    lineId: string
    selectionKey: string
  } | null>(null)
  const initialFocusRequested = useRef(false)

  const selectedStation = useMemo(
    () =>
      data?.stations.find(
        (station) => station.id === urlState.selectedStationId,
      ) ?? null,
    [data, urlState.selectedStationId],
  )
  const selectionKey =
    urlState.selectedSegmentId ?? selectedStation?.id ?? ''
  const fallbackSectionLineId =
    urlState.selectedSegmentId?.split(':')[0] ??
    selectedStation?.lines[0] ??
    [...urlState.selectedLines][0] ??
    (lineIds.includes('C') ? 'C' : lineIds[0]) ??
    'A'
  const activeSectionLineId =
    sectionLineChoice &&
    sectionLineChoice.selectionKey === selectionKey &&
    lineIds.includes(sectionLineChoice.lineId)
      ? sectionLineChoice.lineId
      : fallbackSectionLineId

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
    <main
      className={
        urlState.sectionOpen ? 'viewer-root section-open' : 'viewer-root'
      }
    >
      {sceneError ? null : (
        <SceneView
          data={data}
          selectedLines={urlState.selectedLines}
          selectedSegmentId={urlState.selectedSegmentId}
          xray={urlState.xray}
          onSelectStation={urlState.selectStation}
          onSelectSegment={urlState.selectSegment}
          onError={setSceneError}
        />
      )}

      <ViewerHud
        manifest={data.manifest}
        lines={data.network.lines}
        stations={data.stations}
        selectedLines={urlState.selectedLines}
        selectedStation={selectedStation}
        selectedSegmentId={urlState.selectedSegmentId}
        sectionOpen={urlState.sectionOpen}
        sectionLineId={activeSectionLineId}
        xray={urlState.xray}
        onToggleLine={urlState.toggleLine}
        onSelectStation={urlState.selectStation}
        onSelectSegment={urlState.selectSegment}
        onXRayToggle={urlState.setXray}
        onCloseStation={urlState.clearStation}
        onCloseSegment={urlState.clearSegment}
        onToggleSection={urlState.setSection}
        onSelectSectionLine={(lineId) =>
          setSectionLineChoice({ lineId, selectionKey })
        }
      />

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
