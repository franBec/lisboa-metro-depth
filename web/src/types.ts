export type DepthSource = 'measured' | 'official' | 'estimated' | 'unknown'

export interface Attribution {
  name: string
  role: string
  url: string
}

export interface Manifest {
  schema_version: number
  dataset_version: string
  generated_at: string
  demo: boolean
  capabilities: {
    real_terrain: boolean
    measured_depths: boolean
    streets: boolean
  }
  bbox: {
    min_lat: number
    max_lat: number
    min_lon: number
    max_lon: number
  }
  terrain: {
    kind: string
    file: string
    texture: string
    width: number
    height: number
    min_m: number
    max_m: number
    size_m: { width: number; height: number }
  }
  counts: Record<string, number>
  provenance_counts: {
    platforms: Record<DepthSource, number>
    segments: Record<DepthSource, number>
  }
  attribution: Attribution[]
  source_notes: string[]
  demo_note: string
  last_measurement_merge?: {
    source: string
    merged_at: string
    platform_records: number
    segment_records: number
  }
}

export interface Platform {
  line: string
  lat: number
  lon: number
  surface_elevation_m: number
  platform_depth_m: number | null
  depth_source: DepthSource
  depth_basis: 'station' | 'platform'
  confidence_m: number | null
  official_depth_m: number | null
  measured_depth_m: number | null
  measurement_ids: string[]
  source_url: string | null
  note: string | null
}

export interface Station {
  id: string
  name: string
  lat: number
  lon: number
  surface_elevation_m: number
  lines: string[]
  platforms: Platform[]
}

export interface Vertex {
  lat: number
  lon: number
  distance_m: number
  surface_elevation_m: number
  depth_m: number | null
  source: DepthSource
}

export interface Segment {
  id: string
  from: string
  to: string
  depth_source: DepthSource
  measurement_ids?: string[]
  vertices: Vertex[]
}

export interface Line {
  id: string
  name: string
  short_name: string
  color: string
  direction: string
  headsign: string
  shape_id: string
  segments: Segment[]
}

export interface Network {
  lines: Line[]
}

export interface ViewerData {
  manifest: Manifest
  stations: Station[]
  network: Network
  heights: Float32Array
  texture: import('three').Texture
}
