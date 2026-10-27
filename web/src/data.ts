import { TextureLoader, SRGBColorSpace, type Texture } from 'three'
import type { Manifest, Network, Station, ViewerData } from './types'

const DATA_BASE = '/data/v1/'

async function fetchJson<T>(name: string): Promise<T> {
  const response = await fetch(DATA_BASE + name)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${name}: HTTP ${response.status}`)
  }
  return (await response.json()) as T
}

async function loadTexture(url: string): Promise<Texture> {
  const texture = await new TextureLoader().loadAsync(url)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

export async function loadViewerData(): Promise<ViewerData> {
  const [manifest, stations, network, terrainBuffer, texture] = await Promise.all([
    fetchJson<Manifest>('manifest.json'),
    fetchJson<Station[]>('stations.json'),
    fetchJson<Network>('network.json'),
    fetch(DATA_BASE + 'terrain.bin').then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch terrain.bin: HTTP ${response.status}`)
      }
      return response.arrayBuffer()
    }),
    loadTexture(DATA_BASE + 'ground.png'),
  ])

  const heights = new Float32Array(terrainBuffer)
  const expected = manifest.terrain.width * manifest.terrain.height
  if (heights.length !== expected) {
    throw new Error(`Terrain size mismatch: got ${heights.length}, expected ${expected}`)
  }
  if (!network.lines.length) {
    throw new Error('Network contains no lines')
  }
  return { manifest, stations, network, heights, texture }
}
