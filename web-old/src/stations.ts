import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  type Camera,
} from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { Projection } from './geo'
import type { DepthSource, Line, Station } from './types'

interface MarkerPart {
  object: Object3D
  material: MeshStandardMaterial | MeshBasicMaterial
  lineId: string
  source: DepthSource
  baseOpacity: number
}

interface LabelPart {
  object: CSS2DObject
  element: HTMLDivElement
  lineIds: string[]
  allUnknown: boolean
}

export interface StationLayer {
  group: Group
  pickables: Object3D[]
  setLabelsVisible: (visible: boolean) => void
  setLineFilter: (selected: Set<string> | null) => void
  setInferredVisible: (visible: boolean) => void
  updateLabels: (camera: Camera, width: number, height: number) => void
  dispose: () => void
}

export function buildStations(
  stations: Station[],
  lines: Line[],
  projection: Projection,
  verticalScale: number,
): StationLayer {
  const group = new Group()
  group.name = 'stations'
  const lineColors = new Map(lines.map((line) => [line.id, new Color(line.color)]))
  const pickables: Object3D[] = []
  const parts: MarkerPart[] = []
  const labels: LabelPart[] = []

  for (const station of stations) {
    const { x, z } = projection.toWorld(station.lat, station.lon)
    const surfaceY = station.surface_elevation_m * verticalScale
    const allUnknown = station.platforms.every((platform) => platform.platform_depth_m === null)

    for (const platform of station.platforms) {
      const color = lineColors.get(platform.line) ?? new Color('#999999')
      const platformXZ = projection.toWorld(platform.lat, platform.lon)
      const platformSurfaceY = platform.surface_elevation_m * verticalScale

      if (platform.platform_depth_m === null) {
        const ringGeometry = new TorusGeometry(20, 3, 6, 24)
        const ringMaterial = new MeshStandardMaterial({
          color,
          roughness: 0.7,
          metalness: 0.1,
          transparent: true,
        })
        const ring = new Mesh(ringGeometry, ringMaterial)
        ring.rotation.x = -Math.PI / 2
        ring.position.set(platformXZ.x, platformSurfaceY + 3, platformXZ.z)
        ring.userData.stationId = station.id
        ring.userData.source = 'unknown'
        group.add(ring)
        pickables.push(ring)
        parts.push({ object: ring, material: ringMaterial, lineId: platform.line, source: 'unknown', baseOpacity: 1 })
      } else {
        const platformY = platformSurfaceY - platform.platform_depth_m * verticalScale
        const measured = platform.depth_source === 'measured'
        const ringGeometry = new TorusGeometry(38, 4.5, 8, 32)
        const ringMaterial = new MeshStandardMaterial({
          color,
          emissive: color.clone().multiplyScalar(measured ? 0.55 : 0.18),
          roughness: 0.5,
          metalness: 0.2,
          transparent: true,
        })
        const ring = new Mesh(ringGeometry, ringMaterial)
        ring.rotation.x = -Math.PI / 2
        ring.position.set(platformXZ.x, platformY, platformXZ.z)
        ring.userData.stationId = station.id
        ring.userData.source = platform.depth_source
        group.add(ring)
        pickables.push(ring)
        parts.push({
          object: ring,
          material: ringMaterial,
          lineId: platform.line,
          source: platform.depth_source,
          baseOpacity: 1,
        })

        const shaftHeight = Math.max(platform.platform_depth_m * verticalScale, 1)
        if (shaftHeight > 1) {
          const shaftGeometry = new CylinderGeometry(3.2, 3.2, shaftHeight, 8, 1, true)
          const shaftMaterial = new MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.26,
            depthWrite: false,
            side: DoubleSide,
          })
          const shaft = new Mesh(shaftGeometry, shaftMaterial)
          shaft.position.set(platformXZ.x, platformSurfaceY - shaftHeight / 2, platformXZ.z)
          shaft.userData.stationId = station.id
          shaft.userData.source = platform.depth_source
          group.add(shaft)
          pickables.push(shaft)
          parts.push({
            object: shaft,
            material: shaftMaterial,
            lineId: platform.line,
            source: platform.depth_source,
            baseOpacity: 0.26,
          })

          const discGeometry = new CircleGeometry(26, 28)
          const discMaterial = new MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.24,
            side: DoubleSide,
            depthWrite: false,
          })
          const disc = new Mesh(discGeometry, discMaterial)
          disc.rotation.x = -Math.PI / 2
          disc.position.set(platformXZ.x, platformY + 0.4, platformXZ.z)
          group.add(disc)
          parts.push({
            object: disc,
            material: discMaterial,
            lineId: platform.line,
            source: platform.depth_source,
            baseOpacity: 0.24,
          })
        }
      }
    }

    const element = document.createElement('div')
    element.className = 'station-label'
    if (station.lines.length > 1) {
      element.classList.add('interchange')
    }
    const dot = document.createElement('span')
    dot.className = 'station-dot'
    dot.style.background = lineColors.get(station.lines[0] ?? '')?.getStyle() ?? '#999999'
    const text = document.createElement('span')
    text.textContent = station.name
    element.append(dot, text)
    const label = new CSS2DObject(element)
    label.position.set(x, surfaceY + 42, z)
    label.center.set(0, 1)
    group.add(label)
    labels.push({
      object: label,
      element,
      lineIds: station.lines,
      allUnknown,
    })
  }

  let labelsShown = true
  let inferredShown = true

  const applyVisibility = () => {
    for (const part of parts) {
      if (part.source === 'unknown') {
        part.object.visible = inferredShown
      }
    }
  }

  const updateLabels = (camera: Camera, width: number, height: number) => {
    if (!labelsShown) {
      for (const label of labels) {
        label.object.visible = false
      }
      return
    }
    const candidates: Array<{
      label: LabelPart
      x: number
      y: number
      priority: number
      distance: number
    }> = []
    for (const label of labels) {
      if (!inferredShown && label.allUnknown) {
        label.object.visible = false
        continue
      }
      const world = label.object.position
      const projected = world.clone().project(camera)
      if (projected.z < -1 || projected.z > 1) {
        label.object.visible = false
        continue
      }
      const x = (projected.x * 0.5 + 0.5) * width
      const y = (-projected.y * 0.5 + 0.5) * height
      const rightMargin = width < 700 ? 76 : 110
      if (x < 6 || x > width - rightMargin || y < 70 || y > height - 20) {
        label.object.visible = false
        continue
      }
      candidates.push({
        label,
        x,
        y,
        priority: label.lineIds.length > 1 ? 0 : 1,
        distance: camera.position.distanceTo(world),
      })
    }
    candidates.sort((a, b) => a.priority - b.priority || a.distance - b.distance)
    const kept: Array<{ x: number; y: number }> = []
    for (const candidate of candidates) {
      const clear = kept.every(
        (point) => Math.hypot(point.x - candidate.x, point.y - candidate.y) > 44,
      )
      candidate.label.object.visible = clear
      if (clear) kept.push(candidate)
    }
  }

  const setLabelsVisible = (visible: boolean) => {
    labelsShown = visible
    applyVisibility()
  }

  const setLineFilter = (selected: Set<string> | null) => {
    const active = selected === null || selected.size === 0
    for (const part of parts) {
      const isActive = active || selected.has(part.lineId)
      part.material.opacity = isActive ? part.baseOpacity : Math.min(part.baseOpacity, 0.06)
      part.material.needsUpdate = true
    }
    for (const label of labels) {
      const isActive = active || label.lineIds.some((lineId) => selected.has(lineId))
      label.element.classList.toggle('dimmed', !isActive)
    }
  }

  const setInferredVisible = (visible: boolean) => {
    inferredShown = visible
    applyVisibility()
  }

  const dispose = () => {
    for (const part of parts) {
      const mesh = part.object as Mesh
      mesh.geometry.dispose()
      part.material.dispose()
    }
    for (const label of labels) {
      label.object.removeFromParent()
    }
  }

  return { group, pickables, setLabelsVisible, setLineFilter, setInferredVisible, updateLabels, dispose }
}
