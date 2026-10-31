import type {
  DepthSource,
  Line,
  Station,
} from '../data/schemas'
import {
  getSegmentMetrics,
  type SegmentMetrics,
} from './segmentMetrics'

export interface ProfileStation {
  stationId: string
  name: string
  distanceM: number
  groundM: number | null
  depthM: number | null
  trackM: number | null
  source: DepthSource
  basis: 'station' | 'platform' | null
}

export interface ProfileSegment extends SegmentMetrics {
  startDistanceM: number
  endDistanceM: number
}

export interface LineProfile {
  lineId: string
  lineName: string
  stations: ProfileStation[]
  segments: ProfileSegment[]
  lengthM: number
  minElevationM: number
  maxElevationM: number
  knownStations: number
}

export function buildLineProfile(
  line: Line,
  stationById: ReadonlyMap<string, Station>,
): LineProfile {
  const distances = new Map<string, number>()
  const endpointDepths = new Map<
    string,
    { depthM: number; source: DepthSource }
  >()

  for (const segment of line.segments) {
    const first = segment.vertices[0]
    const last = segment.vertices[segment.vertices.length - 1]
    if (!first || !last) {
      continue
    }
    distances.set(segment.from, first.distance_m)
    distances.set(segment.to, last.distance_m)
    if (first.depth_m !== null) {
      endpointDepths.set(segment.from, {
        depthM: first.depth_m,
        source: first.source,
      })
    }
    if (last.depth_m !== null) {
      endpointDepths.set(segment.to, {
        depthM: last.depth_m,
        source: last.source,
      })
    }
  }

  const stations = [...distances.entries()]
    .map(([stationId, distanceM]): ProfileStation => {
      const station = stationById.get(stationId)
      const platform = station?.platforms.find(
        (candidate) => candidate.line === line.id,
      )
      const platformDepth = platform?.platform_depth_m ?? null
      const endpoint = endpointDepths.get(stationId)
      const depthM = platformDepth ?? endpoint?.depthM ?? null
      const source: DepthSource =
        platformDepth !== null
          ? platform?.depth_source ?? 'unknown'
          : endpoint?.source ?? 'unknown'
      const groundM =
        platform?.ground_elevation_m ?? station?.ground_elevation_m ?? null

      return {
        stationId,
        name: station?.name ?? stationId,
        distanceM,
        groundM,
        depthM,
        trackM:
          groundM !== null && depthM !== null ? groundM - depthM : null,
        source,
        basis: platformDepth !== null ? platform?.depth_basis ?? null : null,
      }
    })
    .sort((first, second) => first.distanceM - second.distanceM)

  const stationDistances = new Map(
    stations.map((station) => [station.stationId, station.distanceM]),
  )

  const segments = line.segments
    .flatMap((segment): ProfileSegment[] => {
      const fromDistance = stationDistances.get(segment.from)
      const toDistance = stationDistances.get(segment.to)
      if (fromDistance === undefined || toDistance === undefined) {
        return []
      }
      return [
        {
          ...getSegmentMetrics(line.id, segment, stationById),
          startDistanceM: Math.min(fromDistance, toDistance),
          endDistanceM: Math.max(fromDistance, toDistance),
        },
      ]
    })
    .sort((first, second) => first.startDistanceM - second.startDistanceM)

  const firstDistance = stations[0]?.distanceM ?? 0
  const lastDistance = stations[stations.length - 1]?.distanceM ?? 0
  const elevations = stations.flatMap((station) =>
    [station.groundM, station.trackM].filter(
      (value): value is number => value !== null,
    ),
  )
  const minElevationM = elevations.length ? Math.min(...elevations) : 0
  const maxElevationM = elevations.length ? Math.max(...elevations) : 1

  return {
    lineId: line.id,
    lineName: line.name,
    stations,
    segments,
    lengthM: Math.max(lastDistance - firstDistance, 0),
    minElevationM,
    maxElevationM,
    knownStations: stations.filter((station) => station.depthM !== null).length,
  }
}
