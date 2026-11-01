import { Vector3 } from 'three'
import type { DepthSource, Line, Station } from '../data/schemas'
import type { Projection } from '../lib/geo'

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
  parallel: boolean
  bearingDeg: number | null
  platformLengthM: number | null
  platformWidthM: number | null
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
    const interchange = station.interchange ?? null
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
        parallel: interchange?.kind === 'parallel',
        bearingDeg: interchange?.axis_bearing_deg ?? null,
        platformLengthM: interchange?.platform_length_m ?? null,
        platformWidthM: interchange?.platform_width_m ?? null,
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
