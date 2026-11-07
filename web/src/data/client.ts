import type { ZodType } from 'zod'
import {
  landmarksSchema,
  manifestSchema,
  networkSchema,
  stationsSchema,
  type Landmark,
  type Manifest,
  type Network,
  type Station,
} from './schemas'

const STATIONS_FILE = 'stations.json'
const NETWORK_FILE = 'network.json'
const LANDMARKS_FILE = 'landmarks.json'

function normalizeBase(base: string): string {
  return base.endsWith('/') ? base : `${base}/`
}

export const DATA_BASE = normalizeBase(
  import.meta.env.VITE_DATA_BASE || '/data/v1/',
)

export function dataUrl(path: string): string {
  return `${DATA_BASE}${path.replace(/^\/+/, '')}`
}

export function terrainTextureUrl(manifest: Manifest): string {
  return dataUrl(manifest.terrain.texture)
}

export interface ViewerData {
  manifest: Manifest
  stations: Station[]
  network: Network
  landmarks: Landmark[]
  heights: Float32Array
}

function formatZodError(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : '(root)'
      return `${path}: ${issue.message}`
    })
    .join('; ')
}

async function fetchJson<T>(
  url: string,
  schema: ZodType<T>,
  label: string,
): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${label}: HTTP ${response.status}`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error(`Failed to parse ${label} as JSON`)
  }

  const result = schema.safeParse(payload)
  if (!result.success) {
    throw new Error(`Invalid ${label}: ${formatZodError(result.error)}`)
  }
  return result.data
}

async function fetchBinary(url: string, label: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${label}: HTTP ${response.status}`)
  }
  return response.arrayBuffer()
}

export async function loadViewerData(): Promise<ViewerData> {
  const manifest = await fetchJson(
    dataUrl('manifest.json'),
    manifestSchema,
    'manifest.json',
  )

  const [stations, network, landmarks, terrainBuffer] = await Promise.all([
    fetchJson(dataUrl(STATIONS_FILE), stationsSchema, STATIONS_FILE),
    fetchJson(dataUrl(NETWORK_FILE), networkSchema, NETWORK_FILE),
    fetchJson(dataUrl(LANDMARKS_FILE), landmarksSchema, LANDMARKS_FILE),
    fetchBinary(dataUrl(manifest.terrain.file), manifest.terrain.file),
  ])

  const expected = manifest.terrain.width * manifest.terrain.height
  const expectedBytes = expected * Float32Array.BYTES_PER_ELEMENT
  if (terrainBuffer.byteLength !== expectedBytes) {
    throw new Error(
      `Terrain size mismatch: got ${terrainBuffer.byteLength} bytes, expected ${expectedBytes}`,
    )
  }

  const heights = new Float32Array(terrainBuffer)
  if (heights.length !== expected) {
    throw new Error(
      `Terrain size mismatch: got ${heights.length} values, expected ${expected}`,
    )
  }

  return { manifest, stations, network, landmarks, heights }
}
