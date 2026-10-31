import type { DepthSource, Line, Vertex } from '../data/schemas'
import type { Projection } from '../lib/geo'

export interface TunnelRun {
  id: string
  segmentId: string
  lineId: string
  source: DepthSource
  color: string
  points: Array<[number, number, number]>
}

function vertexY(vertex: Vertex, verticalScale: number): number {
  if (vertex.depth_m === null) {
    return vertex.surface_elevation_m * verticalScale + 4 * verticalScale + 2
  }
  return (vertex.surface_elevation_m - vertex.depth_m) * verticalScale
}

export function buildTunnelRuns(
  lines: Line[],
  projection: Projection,
  verticalScale: number,
): TunnelRun[] {
  const runs: TunnelRun[] = []

  for (const line of lines) {
    for (const segment of line.segments) {
      let run: Vertex[] = []
      let runSource: DepthSource | null = null
      let runIndex = 0

      const flush = () => {
        const source = runSource
        if (source === null || run.length < 2) {
          run = []
          runSource = null
          return
        }

        const points: Array<[number, number, number]> = run.map((vertex) => {
          const { x, z } = projection.toWorld(vertex.lat, vertex.lon)
          return [x, vertexY(vertex, verticalScale), z]
        })

        runs.push({
          id: `${line.id}:${segment.id}:${runIndex}`,
          segmentId: segment.id,
          lineId: line.id,
          source,
          color: line.color,
          points,
        })
        runIndex += 1
        run = []
        runSource = null
      }

      for (const vertex of segment.vertices) {
        if (runSource === null) {
          runSource = vertex.source
          run = [vertex]
        } else if (runSource === vertex.source) {
          run.push(vertex)
        } else {
          run.push(vertex)
          flush()
          runSource = vertex.source
          run = [vertex]
        }
      }

      flush()
    }
  }

  return runs
}
