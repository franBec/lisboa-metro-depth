import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector2, Vector3, type Camera, type Object3D } from 'three'
import type { StationLabelVisual } from './stationVisuals'
import type { TunnelRun } from './tunnelRuns'

interface StationInteractionProps {
  labels: StationLabelVisual[]
  onSelect: (stationId: string) => void
  onFocus: (stationId: string) => void
  tunnelRuns: TunnelRun[]
  xray: boolean
  onSelectSegment: (segmentId: string) => void
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

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) {
    return Math.hypot(px - x1, py - y1)
  }
  const t = Math.max(
    0,
    Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq),
  )
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function nearestTunnel(
  runs: TunnelRun[],
  camera: Camera,
  size: { width: number; height: number },
  x: number,
  y: number,
): string | null {
  const projected = new Vector3()
  let nearestId: string | null = null
  let nearestDistance = 8

  for (const run of runs) {
    let previous: { x: number; y: number } | null = null
    for (const point of run.points) {
      projected.set(point[0], point[1], point[2]).project(camera)
      if (projected.z < -1 || projected.z > 1) {
        previous = null
        continue
      }
      const screenX = (projected.x * 0.5 + 0.5) * size.width
      const screenY = (-projected.y * 0.5 + 0.5) * size.height
      if (previous) {
        const distance = distanceToSegment(
          x,
          y,
          previous.x,
          previous.y,
          screenX,
          screenY,
        )
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestId = run.segmentId
        }
      }
      previous = { x: screenX, y: screenY }
    }
  }

  return nearestId
}

export function StationInteraction({
  labels,
  onSelect,
  onFocus,
  tunnelRuns,
  xray,
  onSelectSegment,
}: StationInteractionProps) {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const raycaster = useThree((state) => state.raycaster)
  const scene = useThree((state) => state.scene)
  const size = useThree((state) => state.size)

  useEffect(() => {
    const canvas = gl.domElement
    const mouse = new Vector2()
    let pointerStart: { x: number; y: number } | null = null

    const handlePointerDown = (event: PointerEvent) => {
      pointerStart = { x: event.clientX, y: event.clientY }
    }

    const handleClick = (event: MouseEvent) => {
      const start = pointerStart
      pointerStart = null
      if (!start) {
        return
      }
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) {
        return
      }

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
        return
      }

      if (xray) {
        const segmentId = nearestTunnel(
          tunnelRuns,
          camera,
          size,
          event.clientX - rect.left,
          event.clientY - rect.top,
        )
        if (segmentId) {
          onSelectSegment(segmentId)
        }
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!xray) {
        canvas.style.cursor = ''
        return
      }
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        return
      }
      const segmentId = nearestTunnel(
        tunnelRuns,
        camera,
        size,
        event.clientX - rect.left,
        event.clientY - rect.top,
      )
      canvas.style.cursor = segmentId ? 'pointer' : ''
    }

    const handlePointerLeave = () => {
      canvas.style.cursor = ''
    }

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

    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('click', handleClick)
    canvas.addEventListener('dblclick', handleDoubleClick)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerleave', handlePointerLeave)
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('click', handleClick)
      canvas.removeEventListener('dblclick', handleDoubleClick)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [
    camera,
    gl,
    labels,
    onFocus,
    onSelect,
    onSelectSegment,
    raycaster,
    scene,
    size,
    tunnelRuns,
    xray,
  ])

  return null
}
