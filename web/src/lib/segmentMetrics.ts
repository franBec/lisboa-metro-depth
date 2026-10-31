import type {
  DepthSource,
  Segment,
  Station,
} from '../data/schemas'

export type SegmentQuality = 'measured' | 'official' | 'estimated' | 'unknown'

export interface SegmentEndpoint {
  stationId: string
  name: string
  depthM: number | null
  source: DepthSource
  basis: 'station' | 'platform' | null
  groundM: number | null
  trackM: number | null
  sigmaM: number | null
}

export interface SegmentMetrics {
  segmentId: string
  lineId: string
  from: SegmentEndpoint
  to: SegmentEndpoint
  lengthM: number
  gradePct: number | null
  gradeDeg: number | null
  gradeSigmaPct: number | null
  resolvable: boolean
  quality: SegmentQuality
  hasBothEnds: boolean
  profileQuality: 'endpoints' | 'interpolated' | 'none'
  slopeWord: 'climbs' | 'descends' | 'level' | 'unknown'
}

export const DEPTH_SIGMA_MEASURED_M = 1.5
export const DEPTH_SIGMA_OFFICIAL_M = 3
export const GROUND_SIGMA_M = 3

function findPlatform(station: Station | undefined, lineId: string) {
  return station?.platforms.find((platform) => platform.line === lineId)
}

function endpointSigma(
  source: DepthSource,
  confidenceM: number | null,
): number {
  if (confidenceM !== null) {
    return confidenceM
  }
  return source === 'measured'
    ? DEPTH_SIGMA_MEASURED_M
    : DEPTH_SIGMA_OFFICIAL_M
}

function buildEndpoint(
  stationId: string,
  lineId: string,
  stationById: ReadonlyMap<string, Station>,
  vertexDepthM: number | null,
  vertexSource: DepthSource,
): SegmentEndpoint {
  const station = stationById.get(stationId)
  const platform = findPlatform(station, lineId)
  const platformDepth = platform?.platform_depth_m ?? null
  const depthM = platformDepth ?? vertexDepthM
  const source: DepthSource =
    platformDepth !== null
      ? platform?.depth_source ?? 'unknown'
      : vertexSource
  const groundM =
    platform?.ground_elevation_m ?? station?.ground_elevation_m ?? null
  const trackM =
    groundM !== null && depthM !== null ? groundM - depthM : null
  const sigmaM =
    depthM === null
      ? null
      : Math.hypot(
          endpointSigma(source, platform?.confidence_m ?? null),
          GROUND_SIGMA_M,
        )

  return {
    stationId,
    name: station?.name ?? stationId,
    depthM,
    source,
    basis: platformDepth !== null ? platform?.depth_basis ?? null : null,
    groundM,
    trackM,
    sigmaM,
  }
}

function qualityFor(
  segment: Segment,
  from: SegmentEndpoint,
  to: SegmentEndpoint,
): SegmentQuality {
  if (from.depthM === null || to.depthM === null) {
    return 'unknown'
  }
  if (from.source === 'measured' && to.source === 'measured') {
    return 'measured'
  }
  if (from.source === 'official' && to.source === 'official') {
    return 'official'
  }
  if (segment.depth_source === 'estimated') {
    return 'estimated'
  }
  return 'unknown'
}

export function getSegmentMetrics(
  lineId: string,
  segment: Segment,
  stationById: ReadonlyMap<string, Station>,
): SegmentMetrics {
  const lastVertex = segment.vertices[segment.vertices.length - 1]
  const firstVertex = segment.vertices[0]
  const from = buildEndpoint(
    segment.from,
    lineId,
    stationById,
    firstVertex?.depth_m ?? null,
    firstVertex?.source ?? 'unknown',
  )
  const to = buildEndpoint(
    segment.to,
    lineId,
    stationById,
    lastVertex?.depth_m ?? null,
    lastVertex?.source ?? 'unknown',
  )
  const lengthM = Math.max(
    (lastVertex?.distance_m ?? 0) - (firstVertex?.distance_m ?? 0),
    0,
  )
  const hasBothEnds = from.trackM !== null && to.trackM !== null
  const quality = qualityFor(segment, from, to)

  let gradePct: number | null = null
  let gradeDeg: number | null = null
  let gradeSigmaPct: number | null = null
  let resolvable = false
  let slopeWord: SegmentMetrics['slopeWord'] = 'unknown'

  if (hasBothEnds && lengthM > 0) {
    const grade = (to.trackM! - from.trackM!) / lengthM
    gradePct = grade * 100
    gradeDeg = (Math.atan(grade) * 180) / Math.PI
    const sigmaM = Math.hypot(from.sigmaM ?? 0, to.sigmaM ?? 0)
    gradeSigmaPct = (sigmaM / lengthM) * 100
    resolvable = Math.abs(gradePct) >= gradeSigmaPct
    slopeWord = !resolvable
      ? 'level'
      : gradePct > 0
        ? 'climbs'
        : 'descends'
  }

  const profileQuality =
    segment.depth_source === 'measured'
      ? 'endpoints'
      : segment.depth_source === 'estimated'
        ? 'interpolated'
        : 'none'

  return {
    segmentId: segment.id,
    lineId,
    from,
    to,
    lengthM,
    gradePct,
    gradeDeg,
    gradeSigmaPct,
    resolvable,
    quality,
    hasBothEnds,
    profileQuality,
    slopeWord,
  }
}

export function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

export function formatDepth(value: number | null): string {
  return value === null ? 'Unknown' : `${value.toFixed(2)} m`
}

export function formatTrack(value: number | null): string {
  return value === null ? 'Unknown' : `${value.toFixed(1)} m`
}

export function formatSlope(metrics: SegmentMetrics): string {
  if (metrics.gradePct === null || metrics.gradeDeg === null) {
    return 'Unknown'
  }
  if (!metrics.resolvable) {
    const sigma = metrics.gradeSigmaPct?.toFixed(1) ?? '?'
    return `Level within survey error (±${sigma}%)`
  }
  const sign = metrics.gradePct >= 0 ? '+' : '−'
  return `${sign}${Math.abs(metrics.gradePct).toFixed(1)}% (${Math.abs(metrics.gradeDeg).toFixed(1)}°) ${metrics.slopeWord} toward ${metrics.to.name}`
}
