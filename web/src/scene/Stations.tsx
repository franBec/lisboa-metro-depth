import { useMemo, type RefObject } from 'react'
import { Color, DoubleSide } from 'three'
import { useViewerStore } from '../state/viewerStore'
import { StationInteraction } from './StationInteraction'
import { StationLabelDriver } from './StationLabelDriver'
import type { LandmarkLabelVisual } from './landmarkVisuals'
import type {
  PlatformVisual,
  StationLabelVisual,
} from './stationVisuals'
import type { TunnelRun } from './tunnelRuns'

interface StationsProps {
  platforms: PlatformVisual[]
  labels: StationLabelVisual[]
  landmarkLabels: LandmarkLabelVisual[]
  landmarkLabelRefs: RefObject<Map<string, HTMLButtonElement>>
  selectedLines: ReadonlySet<string>
  onSelectStation: (stationId: string) => void
  labelRefs: RefObject<Map<string, HTMLButtonElement>>
  tunnelRuns: TunnelRun[]
  xray: boolean
  onSelectSegment: (segmentId: string) => void
}

interface PlatformMarkerProps {
  platform: PlatformVisual
  active: boolean
  visible: boolean
}

function PlatformMarker({
  platform,
  active,
  visible,
}: PlatformMarkerProps) {
  const measured = platform.source === 'measured'
  const emissive = useMemo(
    () =>
      new Color(platform.color).multiplyScalar(measured ? 0.55 : 0.18),
    [measured, platform.color],
  )

  if (
    platform.parallel &&
    platform.bearingDeg !== null &&
    platform.platformLengthM !== null &&
    platform.platformWidthM !== null
  ) {
    const platformY = platform.platformY ?? platform.surfaceY + 3
    const rotationY =
      Math.PI / 2 - (platform.bearingDeg * Math.PI) / 180
    const opacity = active ? (platform.depth === null ? 0.7 : 1) : 0.08

    return (
      <group visible={visible}>
        {platform.shaftHeight > 1 ? (
          <mesh
            position={[
              platform.x,
              platform.surfaceY - platform.shaftHeight / 2,
              platform.z,
            ]}
            userData={{ stationId: platform.stationId }}
          >
            <cylinderGeometry
              args={[3.2, 3.2, platform.shaftHeight, 8, 1, true]}
            />
            <meshBasicMaterial
              color={platform.color}
              transparent
              opacity={active ? 0.26 : 0.06}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
        ) : null}

        <mesh
          position={[platform.x, platformY, platform.z]}
          rotation={[0, rotationY, 0]}
          userData={{ stationId: platform.stationId }}
        >
          <boxGeometry
            args={[
              platform.platformLengthM,
              2.4,
              platform.platformWidthM,
            ]}
          />
          <meshStandardMaterial
            color={platform.color}
            emissive={emissive}
            roughness={0.5}
            metalness={0.2}
            transparent
            opacity={opacity}
          />
        </mesh>
      </group>
    )
  }

  if (platform.depth === null || platform.platformY === null) {
    return (
      <mesh
        visible={visible}
        position={[platform.x, platform.surfaceY + 3, platform.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        userData={{ stationId: platform.stationId }}
      >
        <torusGeometry args={[20, 3, 6, 24]} />
        <meshStandardMaterial
          color={platform.color}
          roughness={0.7}
          metalness={0.1}
          transparent
          opacity={active ? 1 : 0.06}
        />
      </mesh>
    )
  }

  return (
    <group visible={visible}>
      <mesh
        position={[platform.x, platform.platformY, platform.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        userData={{ stationId: platform.stationId }}
      >
        <torusGeometry args={[38, 4.5, 8, 32]} />
        <meshStandardMaterial
          color={platform.color}
          emissive={emissive}
          roughness={0.5}
          metalness={0.2}
          transparent
          opacity={active ? 1 : 0.06}
        />
      </mesh>

      {platform.shaftHeight > 1 ? (
        <mesh
          position={[
            platform.x,
            platform.surfaceY - platform.shaftHeight / 2,
            platform.z,
          ]}
          userData={{ stationId: platform.stationId }}
        >
          <cylinderGeometry
            args={[3.2, 3.2, platform.shaftHeight, 8, 1, true]}
          />
          <meshBasicMaterial
            color={platform.color}
            transparent
            opacity={active ? 0.26 : 0.06}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      ) : null}

      <mesh
        position={[platform.x, platform.platformY + 0.4, platform.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[26, 28]} />
        <meshBasicMaterial
          color={platform.color}
          transparent
          opacity={active ? 0.24 : 0.06}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

export function Stations({
  platforms,
  labels,
  landmarkLabels,
  landmarkLabelRefs,
  selectedLines,
  onSelectStation,
  labelRefs,
  tunnelRuns,
  xray,
  onSelectSegment,
}: StationsProps) {
  const requestedFocus = useViewerStore((state) => state.requestFocus)
  const inferredVisible = useViewerStore((state) => state.inferredVisible)
  const activeFilter = selectedLines.size ? selectedLines : null

  return (
    <group name="stations">
      {platforms.map((platform) => (
        <PlatformMarker
          key={platform.key}
          platform={platform}
          active={activeFilter === null || activeFilter.has(platform.lineId)}
          visible={inferredVisible || platform.source !== 'unknown'}
        />
      ))}

      <StationLabelDriver
        labels={labels}
        labelRefs={labelRefs}
        landmarkLabels={landmarkLabels}
        landmarkLabelRefs={landmarkLabelRefs}
      />

      <StationInteraction
        labels={labels}
        onSelect={onSelectStation}
        onFocus={requestedFocus}
        tunnelRuns={tunnelRuns}
        xray={xray}
        onSelectSegment={onSelectSegment}
      />
    </group>
  )
}
