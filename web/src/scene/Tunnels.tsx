import { Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { Vector2 } from 'three'
import { useViewerStore } from '../state/viewerStore'
import type { TunnelRun } from './tunnelRuns'

interface TunnelsProps {
  runs: TunnelRun[]
  selectedLines: ReadonlySet<string>
  selectedSegmentId: string | null
}

const BASE_OPACITY = {
  measured: 1,
  official: 1,
  estimated: 0.86,
  unknown: 0.68,
} as const

export function Tunnels({
  runs,
  selectedLines,
  selectedSegmentId,
}: TunnelsProps) {
  const inferredVisible = useViewerStore((state) => state.inferredVisible)
  const size = useThree((state) => state.size)
  const dpr = useThree((state) => state.viewport.dpr)

  const resolution = useMemo(
    () => new Vector2(size.width * dpr, size.height * dpr),
    [dpr, size.height, size.width],
  )
  const activeFilter = selectedLines.size ? selectedLines : null

  return (
    <group name="tunnels">
      {runs.map((run) => {
        const unknown = run.source === 'unknown'
        const estimated = run.source === 'estimated'
        const active = activeFilter === null || activeFilter.has(run.lineId)
        const selected = run.segmentId === selectedSegmentId
        const visible =
          inferredVisible ||
          run.source === 'measured' ||
          run.source === 'official'
        const lineWidth = selected ? 5.6 : unknown ? 2.8 : 3.8
        const opacity = selected
          ? 1
          : selectedSegmentId
            ? 0.16
            : active
              ? BASE_OPACITY[run.source]
              : 0.08

        return (
          <Line
            key={run.id}
            points={run.points}
            color={run.color}
            lineWidth={lineWidth}
            transparent
            opacity={opacity}
            dashed={estimated || unknown}
            dashSize={unknown ? 18 : 55}
            gapSize={unknown ? 18 : 34}
            dashScale={1}
            depthTest
            worldUnits={false}
            renderOrder={3}
            resolution={resolution}
            visible={visible}
            userData={{ segmentId: run.segmentId }}
          />
        )
      })}
    </group>
  )
}
