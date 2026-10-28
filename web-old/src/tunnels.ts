import { Color, Group, type WebGLRenderer } from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import type { Projection } from './geo'
import type { DepthSource, Line, Vertex } from './types'

interface TunnelLine {
  object: Line2
  material: LineMaterial
  source: DepthSource
  lineId: string
}

export interface TunnelLayer {
  group: Group
  materials: LineMaterial[]
  setLineFilter: (selected: Set<string> | null) => void
  setInferredVisible: (visible: boolean) => void
  resize: (width: number, height: number) => void
  dispose: () => void
}

function vertexY(vertex: Vertex, verticalScale: number): number {
  if (vertex.depth_m === null) {
    return vertex.surface_elevation_m * verticalScale + 4 * verticalScale + 2
  }
  return (vertex.surface_elevation_m - vertex.depth_m) * verticalScale
}

export function buildTunnels(
  lines: Line[],
  projection: Projection,
  verticalScale: number,
  renderer: WebGLRenderer,
): TunnelLayer {
  const group = new Group()
  group.name = 'tunnels'
  const parts: TunnelLine[] = []
  for (const line of lines) {
    const lineColor = new Color(line.color)
    for (const segment of line.segments) {
      let run: Vertex[] = []
      let runSource: DepthSource | null = null

      const flush = () => {
        if (runSource === null || run.length < 2) {
          run = []
          runSource = null
          return
        }
        const points: number[] = []
        for (const vertex of run) {
          const { x, z } = projection.toWorld(vertex.lat, vertex.lon)
          points.push(x, vertexY(vertex, verticalScale), z)
        }
        const geometry = new LineGeometry()
        geometry.setPositions(points)
        const estimated = runSource === 'estimated'
        const unknown = runSource === 'unknown'
        const material = new LineMaterial({
          color: lineColor.getHex(),
          linewidth: unknown ? 2.8 : 3.8,
          transparent: true,
          opacity: unknown ? 0.68 : estimated ? 0.86 : 1,
          dashed: estimated || unknown,
          dashSize: unknown ? 18 : 55,
          gapSize: unknown ? 18 : 34,
          dashScale: 1,
          depthTest: true,
          worldUnits: false,
        })
        const object = new Line2(geometry, material)
        object.computeLineDistances()
        object.userData.lineId = line.id
        object.userData.source = runSource
        object.renderOrder = 3
        material.resolution.set(1, 1)
        group.add(object)
        parts.push({ object, material, source: runSource, lineId: line.id })
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

  const materials = parts.map((part) => part.material)

  const setLineFilter = (selected: Set<string> | null) => {
    for (const part of parts) {
      const active = selected === null || selected.size === 0 || selected.has(part.lineId)
      part.material.opacity = active ? (part.source === 'unknown' ? 0.68 : part.source === 'estimated' ? 0.86 : 1) : 0.08
      part.material.needsUpdate = true
    }
  }

  const setInferredVisible = (visible: boolean) => {
    for (const part of parts) {
      part.object.visible = visible || part.source === 'measured' || part.source === 'official'
    }
  }

  const resize = (width: number, height: number) => {
    const pixelRatio = renderer.getPixelRatio()
    for (const material of materials) {
      material.resolution.set(width * pixelRatio, height * pixelRatio)
    }
  }

  const dispose = () => {
    for (const part of parts) {
      part.object.geometry.dispose()
      part.material.dispose()
    }
  }

  return { group, materials, setLineFilter, setInferredVisible, resize, dispose }
}
