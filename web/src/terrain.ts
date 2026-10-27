import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Texture,
} from 'three'
import type { Manifest } from './types'

const SLAB_DEPTH_M = 60

export interface TerrainLayer {
  group: Group
  setXRay: (enabled: boolean) => void
  dispose: () => void
}

export function buildTerrain(
  manifest: Manifest,
  heights: Float32Array,
  texture: Texture,
  verticalScale: number,
): TerrainLayer {
  const size = manifest.terrain.width
  const width = manifest.terrain.size_m.width
  const height = manifest.terrain.size_m.height
  const minHeight = manifest.terrain.min_m
  const bottomY = (minHeight - SLAB_DEPTH_M) * verticalScale

  const group = new Group()
  group.name = 'terrain'

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let row = 0; row < size; row += 1) {
    const z = ((row / (size - 1)) - 0.5) * height
    for (let col = 0; col < size; col += 1) {
      const x = ((col / (size - 1)) - 0.5) * width
      const elevation = heights[row * size + col] ?? minHeight
      positions.push(x, elevation * verticalScale, z)
      uvs.push(col / (size - 1), 1 - row / (size - 1))
    }
  }

  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      const i0 = row * size + col
      const i1 = i0 + 1
      const i2 = i0 + size
      const i3 = i2 + 1
      indices.push(i0, i2, i1, i1, i2, i3)
    }
  }

  const topGeometry = new BufferGeometry()
  topGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  topGeometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  topGeometry.setIndex(indices)
  topGeometry.computeVertexNormals()

  const topMaterial = new MeshStandardMaterial({
    map: texture,
    roughness: 0.97,
    metalness: 0.0,
  })
  const top = new Mesh(topGeometry, topMaterial)
  top.name = 'terrain-top'
  group.add(top)

  const wallGeometry = buildWalls(heights, size, width, height, verticalScale, bottomY)
  const wallMaterial = new MeshBasicMaterial({
    color: new Color('#211f1b'),
    side: DoubleSide,
  })
  const walls = new Mesh(wallGeometry, wallMaterial)
  walls.name = 'terrain-walls'
  group.add(walls)

  const bottomGeometry = new PlaneGeometry(width, height)
  const bottomMaterial = new MeshBasicMaterial({
    color: new Color('#121413'),
    side: DoubleSide,
  })
  const bottom = new Mesh(bottomGeometry, bottomMaterial)
  bottom.rotation.x = -Math.PI / 2
  bottom.position.y = bottomY
  bottom.name = 'terrain-bottom'
  group.add(bottom)

  const setXRay = (enabled: boolean) => {
    topMaterial.transparent = enabled
    topMaterial.opacity = enabled ? 0.2 : 1
    topMaterial.depthWrite = !enabled
    wallMaterial.transparent = enabled
    wallMaterial.opacity = enabled ? 0.09 : 1
    wallMaterial.depthWrite = !enabled
    bottomMaterial.transparent = enabled
    bottomMaterial.opacity = enabled ? 0.06 : 1
    bottomMaterial.depthWrite = !enabled
    topMaterial.needsUpdate = true
    wallMaterial.needsUpdate = true
    bottomMaterial.needsUpdate = true
  }

  const dispose = () => {
    topGeometry.dispose()
    topMaterial.dispose()
    wallGeometry.dispose()
    wallMaterial.dispose()
    bottomGeometry.dispose()
    bottomMaterial.dispose()
  }

  return { group, setXRay, dispose }
}

function buildWalls(
  heights: Float32Array,
  size: number,
  width: number,
  height: number,
  verticalScale: number,
  bottomY: number,
): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  let cursor = 0

  const addWall = (points: Array<{ x: number; z: number; h: number }>) => {
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index]
      positions.push(point.x, point.h * verticalScale, point.z)
      positions.push(point.x, bottomY, point.z)
      if (index > 0) {
        const base = cursor + (index - 1) * 2
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
      }
    }
    cursor += points.length * 2
  }

  const north: Array<{ x: number; z: number; h: number }> = []
  const south: Array<{ x: number; z: number; h: number }> = []
  const west: Array<{ x: number; z: number; h: number }> = []
  const east: Array<{ x: number; z: number; h: number }> = []
  for (let index = 0; index < size; index += 1) {
    const x = ((index / (size - 1)) - 0.5) * width
    const z = ((index / (size - 1)) - 0.5) * height
    north.push({ x, z: -height / 2, h: heights[index] ?? 0 })
    south.push({ x, z: height / 2, h: heights[(size - 1) * size + index] ?? 0 })
    west.push({ x: -width / 2, z, h: heights[index * size] ?? 0 })
    east.push({ x: width / 2, z, h: heights[index * size + size - 1] ?? 0 })
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
