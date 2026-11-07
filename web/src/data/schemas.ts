import { z } from 'zod'

const finiteNumber = z.number().finite()
const nonNegativeNumber = z.number().finite().nonnegative()
const coordinate = finiteNumber

export const depthSourceSchema = z.enum([
  'measured',
  'official',
  'estimated',
  'unknown',
])

export type DepthSource = z.infer<typeof depthSourceSchema>

export const structureSchema = z.enum([
  'underground',
  'overground',
  'at-grade',
  'unknown',
])

export type Structure = z.infer<typeof structureSchema>

export const interchangeSchema = z.object({
  kind: z.literal('parallel'),
  axis_bearing_deg: finiteNumber,
  spacing_m: nonNegativeNumber,
  platform_length_m: nonNegativeNumber,
  platform_width_m: nonNegativeNumber,
})

export type Interchange = z.infer<typeof interchangeSchema>

const attributionSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  url: z.string().url(),
})

const lastMeasurementMergeSchema = z.object({
  source: z.string().min(1),
  merged_at: z.string().min(1),
  platform_records: z.number().int().nonnegative(),
  segment_records: z.number().int().nonnegative(),
})

const bboxSchema = z
  .object({
    min_lat: coordinate,
    max_lat: coordinate,
    min_lon: coordinate,
    max_lon: coordinate,
  })
  .refine(
    (bbox) => bbox.min_lat < bbox.max_lat && bbox.min_lon < bbox.max_lon,
    { message: 'bbox minimums must be smaller than maximums' },
  )

const terrainSchema = z
  .object({
    kind: z.string().min(1),
    file: z.string().min(1),
    texture: z.string().min(1),
    width: z.number().int().min(2),
    height: z.number().int().min(2),
    min_m: finiteNumber,
    max_m: finiteNumber,
    size_m: z.object({
      width: nonNegativeNumber,
      height: nonNegativeNumber,
    }),
  })
  .refine((terrain) => terrain.min_m <= terrain.max_m, {
    message: 'terrain.min_m must not exceed terrain.max_m',
  })
  .refine(
    (terrain) => terrain.size_m.width > 0 && terrain.size_m.height > 0,
    { message: 'terrain size must be positive' },
  )

const sourceCountsSchema = z.object({
  measured: z.number().int().nonnegative(),
  official: z.number().int().nonnegative(),
  estimated: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
})

export const manifestSchema = z.object({
  schema_version: z.literal(1),
  dataset_version: z.string().min(1),
  generated_at: z.string().min(1),
  demo: z.boolean(),
  capabilities: z.object({
    real_terrain: z.boolean(),
    measured_depths: z.boolean(),
    streets: z.boolean(),
  }),
  bbox: bboxSchema,
  terrain: terrainSchema,
  counts: z.record(z.string(), z.number().int().nonnegative()),
  provenance_counts: z.object({
    platforms: sourceCountsSchema,
    segments: sourceCountsSchema,
  }),
  attribution: z.array(attributionSchema),
  source_notes: z.array(z.string()),
  demo_note: z.string(),
  last_measurement_merge: lastMeasurementMergeSchema.optional(),
})

export const platformSchema = z.object({
  line: z.string().min(1),
  lat: coordinate,
  lon: coordinate,
  surface_elevation_m: finiteNumber,
  ground_elevation_m: finiteNumber,
  ground_elevation_source: z.string().min(1),
  platform_depth_m: finiteNumber.nullable(),
  depth_source: depthSourceSchema,
  depth_basis: z.enum(['station', 'platform']),
  confidence_m: finiteNumber.nullable(),
  official_depth_m: finiteNumber.nullable(),
  measured_depth_m: finiteNumber.nullable(),
  measurement_ids: z.array(z.string()),
  source_url: z.string().url().nullable(),
  note: z.string().nullable(),
})

export const stationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: coordinate,
  lon: coordinate,
  surface_elevation_m: finiteNumber,
  ground_elevation_m: finiteNumber,
  ground_elevation_source: z.string().min(1),
  lines: z.array(z.string().min(1)).min(1),
  platforms: z.array(platformSchema).min(1),
  structure: structureSchema.optional(),
  interchange: interchangeSchema.optional(),
})

export const vertexSchema = z.object({
  lat: coordinate,
  lon: coordinate,
  distance_m: nonNegativeNumber,
  surface_elevation_m: finiteNumber,
  depth_m: finiteNumber.nullable(),
  source: depthSourceSchema,
})

export const segmentSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  depth_source: depthSourceSchema,
  measurement_ids: z.array(z.string()).optional(),
  vertices: z.array(vertexSchema).min(2),
})

export const lineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  short_name: z.string().min(1),
  color: z.string().min(1),
  direction: z.string().min(1),
  headsign: z.string().min(1),
  shape_id: z.string().min(1),
  segments: z.array(segmentSchema),
})

export const landmarkKindSchema = z.enum(['landmark', 'park', 'water'])

export type LandmarkKind = z.infer<typeof landmarkKindSchema>

export const landmarkSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: landmarkKindSchema,
  lat: coordinate,
  lon: coordinate,
  surface_elevation_m: finiteNumber,
})

export const stationsSchema = z.array(stationSchema)
export const landmarksSchema = z.array(landmarkSchema)
export const networkSchema = z.object({
  lines: z.array(lineSchema).min(1),
})

export type Manifest = z.infer<typeof manifestSchema>
export type Platform = z.infer<typeof platformSchema>
export type Station = z.infer<typeof stationSchema>
export type Vertex = z.infer<typeof vertexSchema>
export type Segment = z.infer<typeof segmentSchema>
export type Line = z.infer<typeof lineSchema>
export type Network = z.infer<typeof networkSchema>
export type Landmark = z.infer<typeof landmarkSchema>
