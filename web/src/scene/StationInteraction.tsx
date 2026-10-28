import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector2, Vector3, type Camera, type Object3D } from 'three'
import type { StationLabelVisual } from './stationVisuals'

interface StationInteractionProps {
  labels: StationLabelVisual[]
  onSelect: (stationId: string) => void
  onFocus: (stationId: string) => void
}

function findStationId(object: Object3D): string | null {
  let current: Object3D | null = object
  while (current) {
    const stationId = current.userData.stationId
    if (typeof stationId === 'string') {
      return stationId
    }
    current = current.parent
  }
  return null
}

function nearestStation(
  labels: StationLabelVisual[],
  camera: Camera,
  size: { width: number; height: number },
  x: number,
  y: number,
): string | null {
  const projected = new Vector3()
  let nearestId: string | null = null
  let nearestDistance = 14

  for (const label of labels) {
    projected.copy(label.position).project(camera)
    if (projected.z < -1 || projected.z > 1) {
      continue
    }

    const screenX = (projected.x * 0.5 + 0.5) * size.width
    const screenY = (-projected.y * 0.5 + 0.5) * size.height
    const distance = Math.hypot(screenX - x, screenY - y)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestId = label.stationId
    }
  }

  return nearestId
}

export function StationInteraction({
  labels,
  onSelect,
  onFocus,
}: StationInteractionProps) {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const raycaster = useThree((state) => state.raycaster)
  const scene = useThree((state) => state.scene)
  const size = useThree((state) => state.size)

  useEffect(() => {
    const canvas = gl.domElement
    const mouse = new Vector2()

    const handleDoubleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        return
      }

      mouse.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(mouse, camera)

      const hits = raycaster.intersectObjects(scene.children, true)
      for (const hit of hits) {
        const stationId = findStationId(hit.object)
        if (stationId) {
          onSelect(stationId)
          onFocus(stationId)
          return
        }
      }

      const stationId = nearestStation(
        labels,
        camera,
        size,
        event.clientX - rect.left,
        event.clientY - rect.top,
      )
      if (stationId) {
        onSelect(stationId)
        onFocus(stationId)
      }
    }

    canvas.addEventListener('dblclick', handleDoubleClick)
    return () => canvas.removeEventListener('dblclick', handleDoubleClick)
  }, [camera, gl, labels, onFocus, onSelect, raycaster, scene, size])

  return null
}
