import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { Manifest } from '../data/schemas'

export const SLAB_DEPTH_M = 60

export function terrainBottomY(
  manifest: Manifest,
  verticalScale: number,
): number {
  return (manifest.terrain.min_m - SLAB_DEPTH_M) * verticalScale
}

export function buildTerrainSurface(
  manifest: Manifest,
  heights: Float32Array,
  verticalScale: number,
): BufferGeometry {
  const cols = manifest.terrain.width
  const rows = manifest.terrain.height
  const widthM = manifest.terrain.size_m.width
  const heightM = manifest.terrain.size_m.height
  const minHeight = manifest.terrain.min_m

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let row = 0; row < rows; row += 1) {
    const z = (row / (rows - 1) - 0.5) * heightM
    for (let col = 0; col < cols; col += 1) {
      const x = (col / (cols - 1) - 0.5) * widthM
      const elevation = heights[row * cols + col] ?? minHeight
      positions.push(x, elevation * verticalScale, z)
      uvs.push(col / (cols - 1), 1 - row / (rows - 1))
    }
  }

  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const i0 = row * cols + col
      const i1 = i0 + 1
      const i2 = i0 + cols
      const i3 = i2 + 1
      indices.push(i0, i2, i1, i1, i2, i3)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function buildTerrainWalls(
  manifest: Manifest,
  heights: Float32Array,
  verticalScale: number,
  bottomY: number,
): BufferGeometry {
  const cols = manifest.terrain.width
  const rows = manifest.terrain.height
  const widthM = manifest.terrain.size_m.width
  const heightM = manifest.terrain.size_m.height

  const positions: number[] = []
  const indices: number[] = []

  const addWall = (points: Array<{ x: number; z: number; h: number }>) => {
    const start = positions.length / 3
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index]
      positions.push(point.x, point.h * verticalScale, point.z)
      positions.push(point.x, bottomY, point.z)

      if (index > 0) {
        const base = start + (index - 1) * 2
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
      }
    }
  }

  const north: Array<{ x: number; z: number; h: number }> = []
  const south: Array<{ x: number; z: number; h: number }> = []
  const west: Array<{ x: number; z: number; h: number }> = []
  const east: Array<{ x: number; z: number; h: number }> = []

  for (let col = 0; col < cols; col += 1) {
    const x = (col / (cols - 1) - 0.5) * widthM
    north.push({ x, z: -heightM / 2, h: heights[col] ?? 0 })
    south.push({
      x,
      z: heightM / 2,
      h: heights[(rows - 1) * cols + col] ?? 0,
    })
  }

  for (let row = 0; row < rows; row += 1) {
    const z = (row / (rows - 1) - 0.5) * heightM
    west.push({ x: -widthM / 2, z, h: heights[row * cols] ?? 0 })
    east.push({
      x: widthM / 2,
      z,
      h: heights[row * cols + cols - 1] ?? 0,
    })
  }

  addWall(north)
  addWall(south)
  addWall(west)
  addWall(east)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
