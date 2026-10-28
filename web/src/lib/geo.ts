import type { Manifest } from '../data/schemas'

export interface Bounds {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
  widthM: number
  heightM: number
}

export class Projection {
  readonly bounds: Bounds

  constructor(manifest: Manifest) {
    this.bounds = {
      minLat: manifest.bbox.min_lat,
      maxLat: manifest.bbox.max_lat,
      minLon: manifest.bbox.min_lon,
      maxLon: manifest.bbox.max_lon,
      widthM: manifest.terrain.size_m.width,
      heightM: manifest.terrain.size_m.height,
    }
  }

  toWorld(lat: number, lon: number): { x: number; z: number } {
    const { minLat, maxLat, minLon, maxLon, widthM, heightM } = this.bounds
    return {
      x: ((lon - minLon) / (maxLon - minLon) - 0.5) * widthM,
      z: ((maxLat - lat) / (maxLat - minLat) - 0.5) * heightM,
    }
  }

  toLatLon(x: number, z: number): { lat: number; lon: number } {
    const { minLat, maxLat, minLon, maxLon, widthM, heightM } = this.bounds
    return {
      lat: maxLat - (z / heightM + 0.5) * (maxLat - minLat),
      lon: minLon + (x / widthM + 0.5) * (maxLon - minLon),
    }
  }
}

export class HeightField {
  private readonly data: Float32Array
  private readonly width: number
  private readonly height: number
  private readonly projection: Projection

  constructor(
    data: Float32Array,
    width: number,
    height: number,
    projection: Projection,
  ) {
    this.data = data
    this.width = width
    this.height = height
    this.projection = projection
  }

  atWorld(x: number, z: number): number {
    const { widthM, heightM } = this.projection.bounds
    const fx = ((x + widthM / 2) / widthM) * (this.width - 1)
    const fy = ((z + heightM / 2) / heightM) * (this.height - 1)
    return this.bilinear(fx, fy)
  }

  atLatLon(lat: number, lon: number): number {
    const { x, z } = this.projection.toWorld(lat, lon)
    return this.atWorld(x, z)
  }

  private bilinear(fx: number, fy: number): number {
    const x = Math.min(Math.max(fx, 0), this.width - 1)
    const y = Math.min(Math.max(fy, 0), this.height - 1)
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const x1 = Math.min(x0 + 1, this.width - 1)
    const y1 = Math.min(y0 + 1, this.height - 1)
    const tx = x - x0
    const ty = y - y0
    const h00 = this.data[y0 * this.width + x0]
    const h10 = this.data[y0 * this.width + x1]
    const h01 = this.data[y1 * this.width + x0]
    const h11 = this.data[y1 * this.width + x1]
    return (
      h00 * (1 - tx) * (1 - ty) +
      h10 * tx * (1 - ty) +
      h01 * (1 - tx) * ty +
      h11 * tx * ty
    )
  }
}
