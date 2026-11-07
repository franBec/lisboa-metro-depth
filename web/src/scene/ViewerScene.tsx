import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import {
  Suspense,
  useMemo,
  useRef,
  type ComponentRef,
  type RefObject,
} from 'react'
import type { Manifest, Network, Station } from '../data/schemas'
import type { Projection } from '../lib/geo'
import { useViewerStore } from '../state/viewerStore'
import { CameraRig } from './CameraRig'
import { Landmarks } from './Landmarks'
import type { LandmarkVisuals } from './landmarkVisuals'
import { Stations } from './Stations'
import type { StationVisuals } from './stationVisuals'
import { Terrain } from './Terrain'
import { buildTunnelRuns } from './tunnelRuns'
import { Tunnels } from './Tunnels'

type OrbitControlsInstance = ComponentRef<typeof OrbitControls>

const DPR: [number, number] = [1, 2]
const GL_CONFIG = { antialias: true, alpha: false }

interface ViewerSceneProps {
  manifest: Manifest
  stations: Station[]
  network: Network
  heights: Float32Array
  projection: Projection
  selectedLines: ReadonlySet<string>
  selectedSegmentId: string | null
  xray: boolean
  stationVisuals: StationVisuals
  landmarkVisuals: LandmarkVisuals
  labelRefs: RefObject<Map<string, HTMLButtonElement>>
  landmarkLabelRefs: RefObject<Map<string, HTMLButtonElement>>
  onSelectStation: (stationId: string) => void
  onSelectSegment: (segmentId: string) => void
}

export function ViewerScene({
  manifest,
  stations,
  network,
  heights,
  projection,
  selectedLines,
  selectedSegmentId,
  xray,
  stationVisuals,
  landmarkVisuals,
  labelRefs,
  landmarkLabelRefs,
  onSelectStation,
  onSelectSegment,
}: ViewerSceneProps) {
  const verticalScale = useViewerStore((state) => state.verticalScale)
  const inferredVisible = useViewerStore((state) => state.inferredVisible)
  const controlsRef = useRef<OrbitControlsInstance | null>(null)
  const tunnelRuns = useMemo(
    () => buildTunnelRuns(network.lines, projection, verticalScale),
    [network.lines, projection, verticalScale],
  )
  const pickableRuns = useMemo(
    () =>
      tunnelRuns.filter(
        (run) =>
          (inferredVisible ||
            run.source === 'measured' ||
            run.source === 'official') &&
          (selectedLines.size === 0 || selectedLines.has(run.lineId)),
      ),
    [inferredVisible, selectedLines, tunnelRuns],
  )

  const { widthM, heightM } = projection.bounds
  const targetY = manifest.terrain.max_m * 2.5
  const cameraConfig = useMemo(
    () => ({
      fov: 42,
      near: 5,
      far: 60000,
      position: [
        widthM * 0.52,
        targetY + heightM * 0.58,
        heightM * 0.68,
      ] as [number, number, number],
    }),
    [heightM, targetY, widthM],
  )
  const controlsTarget = useMemo(
    () => [0, targetY, 0] as [number, number, number],
    [targetY],
  )

  return (
    <Canvas
      flat
      dpr={DPR}
      gl={GL_CONFIG}
      camera={cameraConfig}
      className="block touch-none outline-none"
    >
      <color attach="background" args={['#0b0f10']} />
      <fogExp2 attach="fog" args={['#0b0f10', 0.000035]} />

      <hemisphereLight args={['#c9dde0', '#191b15', 2.2]} />
      <directionalLight
        color="#ffe8c4"
        intensity={2.4}
        position={[-widthM * 0.45, heightM * 0.9, -heightM * 0.55]}
      />
      <directionalLight
        color="#66899c"
        intensity={0.9}
        position={[widthM * 0.55, heightM * 0.35, heightM * 0.7]}
      />

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.075}
        minDistance={900}
        maxDistance={32000}
        maxPolarAngle={Math.PI * 0.495}
        target={controlsTarget}
      />

      <CameraRig
        manifest={manifest}
        projection={projection}
        stations={stations}
        controlsRef={controlsRef}
      />

      <Suspense fallback={null}>
        <Terrain
          key={verticalScale}
          manifest={manifest}
          heights={heights}
          verticalScale={verticalScale}
          xray={xray}
        />
      </Suspense>

      <Tunnels
        runs={tunnelRuns}
        selectedLines={selectedLines}
        selectedSegmentId={selectedSegmentId}
      />

      <Landmarks pins={landmarkVisuals.pins} />

      <Stations
        platforms={stationVisuals.platforms}
        labels={stationVisuals.labels}
        landmarkLabels={landmarkVisuals.labels}
        landmarkLabelRefs={landmarkLabelRefs}
        selectedLines={selectedLines}
        onSelectStation={onSelectStation}
        labelRefs={labelRefs}
        tunnelRuns={pickableRuns}
        xray={xray}
        onSelectSegment={onSelectSegment}
      />
    </Canvas>
  )
}
