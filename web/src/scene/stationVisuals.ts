import { Vector3 } from 'three'
import type {
  DepthSource,
  Line,
  PlatformGeometry,
  Station,
} from '../data/schemas'
import type { Projection } from '../lib/geo'

const SLAB_OVERLAP_M = 1

export interface PlatformVisual {
  key: string
  stationId: string
  lineId: string
  color: string
  source: DepthSource
  x: number
  z: number
  surfaceY: number
  platformY: number | null
  depth: number | null
  shaftHeight: number
  slabs: PlatformSlab[]
}

export interface PlatformSlab {
  x: number
  z: number
  rotationY: number
  lengthM: number
  widthM: number
}

export interface StationLabelVisual {
  stationId: string
  name: string
  colors: string[]
  lineIds: string[]
  interchange: boolean
  allUnknown: boolean
  depthSummary: string
  position: Vector3
}

export interface StationVisuals {
  platforms: PlatformVisual[]
  labels: StationLabelVisual[]
}

function platformSlabs(
  geometry: PlatformGeometry,
  platformPoint: { x: number; z: number },
  projection: Projection,
): PlatformSlab[] {
  if (geometry.shape === 'straight') {
    return [
      {
        x: platformPoint.x,
        z: platformPoint.z,
        rotationY: Math.PI / 2 - (geometry.bearing_deg * Math.PI) / 180,
        lengthM: geometry.length_m,
        widthM: geometry.width_m,
      },
    ]
  }

  const points = geometry.path.map((point) =>
    projection.toWorld(point.lat, point.lon),
  )
  const slabs: PlatformSlab[] = []
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    const dx = to.x - from.x
    const dz = to.z - from.z
    const length = Math.hypot(dx, dz)
    if (length === 0) continue
    slabs.push({
      x: (from.x + to.x) / 2,
      z: (from.z + to.z) / 2,
      rotationY: Math.atan2(-dz, dx),
      lengthM: length + SLAB_OVERLAP_M,
      widthM: geometry.width_m,
    })
  }
  return slabs
}

export function buildStationVisuals(
  stations: Station[],
  lines: Line[],
  projection: Projection,
  verticalScale: number,
): StationVisuals {
  const lineColors = new Map(lines.map((line) => [line.id, line.color]))
  const platforms: PlatformVisual[] = []
  const labels: StationLabelVisual[] = []

  for (const station of stations) {
    const { x, z } = projection.toWorld(station.lat, station.lon)
    const surfaceY = station.surface_elevation_m * verticalScale
    const allUnknown = station.platforms.every(
      (platform) => platform.platform_depth_m === null,
    )

    station.platforms.forEach((platform, index) => {
      const platformPoint = projection.toWorld(platform.lat, platform.lon)
      const platformSurfaceY = platform.surface_elevation_m * verticalScale
      const depth = platform.platform_depth_m
      const shaftHeight =
        depth === null ? 0 : Math.max(depth * verticalScale, 1)

      platforms.push({
        key: `${station.id}:${platform.line}:${index}`,
        stationId: station.id,
        lineId: platform.line,
        color: lineColors.get(platform.line) ?? '#999999',
        source: depth === null ? 'unknown' : platform.depth_source,
        x: platformPoint.x,
        z: platformPoint.z,
        surfaceY: platformSurfaceY,
        platformY:
          depth === null ? null : platformSurfaceY - depth * verticalScale,
        depth,
        shaftHeight,
        slabs: platformSlabs(platform.geometry, platformPoint, projection),
      })
    })

    labels.push({
      stationId: station.id,
      name: station.name,
      colors: station.lines.map((lineId) => lineColors.get(lineId) ?? '#999999'),
      lineIds: station.lines,
      interchange: station.lines.length > 1,
      allUnknown,
      depthSummary: station.platforms
        .map((platform) =>
          platform.platform_depth_m === null
            ? `${platform.line} unknown`
            : `${platform.line} ${platform.platform_depth_m.toFixed(1)} m`,
        )
        .join(' · '),
      position: new Vector3(x, surfaceY + 42, z),
    })
  }

  return { platforms, labels }
}
