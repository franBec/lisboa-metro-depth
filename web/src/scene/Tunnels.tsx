import { Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { Vector2 } from 'three'
import type { Line as MetroLine } from '../data/schemas'
import type { Projection } from '../lib/geo'
import { useViewerStore } from '../state/viewerStore'
import { buildTunnelRuns } from './tunnelRuns'

interface TunnelsProps {
  lines: MetroLine[]
  projection: Projection
  selectedLines: ReadonlySet<string>
}

const BASE_OPACITY = {
  measured: 1,
  official: 1,
  estimated: 0.86,
  unknown: 0.68,
} as const

export function Tunnels({
  lines,
  projection,
  selectedLines,
}: TunnelsProps) {
  const verticalScale = useViewerStore((state) => state.verticalScale)
  const inferredVisible = useViewerStore((state) => state.inferredVisible)
  const size = useThree((state) => state.size)
  const dpr = useThree((state) => state.viewport.dpr)

  const resolution = useMemo(
    () => new Vector2(size.width * dpr, size.height * dpr),
    [dpr, size.height, size.width],
  )
  const runs = useMemo(
    () => buildTunnelRuns(lines, projection, verticalScale),
    [lines, projection, verticalScale],
  )
  const activeFilter = selectedLines.size ? selectedLines : null

  return (
    <group name="tunnels">
      {runs.map((run) => {
        const unknown = run.source === 'unknown'
        const estimated = run.source === 'estimated'
        const active = activeFilter === null || activeFilter.has(run.lineId)
        const visible =
          inferredVisible ||
          run.source === 'measured' ||
          run.source === 'official'

        return (
          <Line
            key={run.id}
            points={run.points}
            color={run.color}
            lineWidth={unknown ? 2.8 : 3.8}
            transparent
            opacity={active ? BASE_OPACITY[run.source] : 0.08}
            dashed={estimated || unknown}
            dashSize={unknown ? 18 : 55}
            gapSize={unknown ? 18 : 34}
            dashScale={1}
            depthTest
            worldUnits={false}
            renderOrder={3}
            resolution={resolution}
            visible={visible}
          />
        )
      })}
    </group>
  )
}
