import type { DepthSource } from '../data/schemas'

export const SOURCE_LABELS: Record<DepthSource, string> = {
  measured: 'Measured',
  official: 'Official',
  estimated: 'Estimated',
  unknown: 'Unknown',
}

export const SOURCE_ORDER: DepthSource[] = [
  'measured',
  'official',
  'estimated',
  'unknown',
]

export const SOURCE_COLORS: Record<DepthSource, string> = {
  measured: '#d9d4c6',
  official: '#9fa39a',
  estimated: '#7f8c86',
  unknown: '#6d6e68',
}
