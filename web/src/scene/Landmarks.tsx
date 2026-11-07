import { DoubleSide } from 'three'
import type { LandmarkPinVisual } from './landmarkVisuals'
import {
  LANDMARK_PIN_LIFT,
  LANDMARK_PIN_SIZE,
  LANDMARK_STEM_HEIGHT,
} from './landmarkVisuals'

const BRASS = '#d4b073'

interface LandmarkMarkerProps {
  pin: LandmarkPinVisual
}

function LandmarkMarker({ pin }: LandmarkMarkerProps) {
  return (
    <group position={[pin.x, pin.surfaceY, pin.z]}>
      <mesh position={[0, 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[20, 1.4, 6, 32]} />
        <meshBasicMaterial
          color={BRASS}
          transparent
          opacity={0.2}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <mesh position={[0, LANDMARK_STEM_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[1.6, 1.6, LANDMARK_STEM_HEIGHT, 6]} />
        <meshBasicMaterial color={BRASS} transparent opacity={0.3} />
      </mesh>

      <mesh position={[0, LANDMARK_STEM_HEIGHT + LANDMARK_PIN_LIFT, 0]}>
        <octahedronGeometry args={[LANDMARK_PIN_SIZE, 0]} />
        <meshStandardMaterial
          color={BRASS}
          emissive="#7a5c2e"
          emissiveIntensity={0.55}
          roughness={0.35}
          metalness={0.55}
        />
      </mesh>
    </group>
  )
}

interface LandmarksProps {
  pins: LandmarkPinVisual[]
}

export function Landmarks({ pins }: LandmarksProps) {
  return (
    <group name="landmarks">
      {pins.map((pin) => (
        <LandmarkMarker key={pin.id} pin={pin} />
      ))}
    </group>
  )
}
