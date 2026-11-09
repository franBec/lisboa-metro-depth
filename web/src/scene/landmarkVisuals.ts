import { Vector3 } from 'three'
import type { Landmark, LandmarkKind } from '../data/schemas'
import type { Projection } from '../lib/geo'
import { LANDMARK_MODEL_TOPS, hasLandmarkModel } from './landmarkModels'

export interface LandmarkPinVisual {
  id: string
  name: string
  x: number
  z: number
  surfaceY: number
}

export interface LandmarkLabelVisual {
  id: string
  name: string
  kind: LandmarkKind
  position: Vector3
}

export interface LandmarkVisuals {
  pins: LandmarkPinVisual[]
  labels: LandmarkLabelVisual[]
}

export const LANDMARK_STEM_HEIGHT = 110
export const LANDMARK_PIN_LIFT = 8
export const LANDMARK_PIN_SIZE = 15

const LABEL_LIFT: Record<LandmarkKind, number> = {
  landmark: LANDMARK_STEM_HEIGHT + LANDMARK_PIN_LIFT + LANDMARK_PIN_SIZE + 45,
  park: 80,
  water: 45,
}

export function buildLandmarkVisuals(
  landmarks: Landmark[],
  projection: Projection,
  verticalScale: number,
): LandmarkVisuals {
  const pins: LandmarkPinVisual[] = []
  const labels: LandmarkLabelVisual[] = []

  for (const landmark of landmarks) {
    const { x, z } = projection.toWorld(landmark.lat, landmark.lon)
    const surfaceY = landmark.surface_elevation_m * verticalScale

    if (landmark.kind === 'landmark') {
      pins.push({ id: landmark.id, name: landmark.name, x, z, surfaceY })
    }

    // Labels for modeled landmarks clear the building's top; the rest keep
    // the flat pin/park/water lifts.
    const lift =
      landmark.kind === 'landmark' && hasLandmarkModel(landmark.id)
        ? LANDMARK_MODEL_TOPS[landmark.id] + 45
        : LABEL_LIFT[landmark.kind]

    labels.push({
      id: landmark.id,
      name: landmark.name,
      kind: landmark.kind,
      position: new Vector3(x, surfaceY + lift, z),
    })
  }

  return { pins, labels }
}
