import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import { Vector3 } from 'three'
import { useViewerStore } from '../state/viewerStore'
import type { StationLabelVisual } from './stationVisuals'

interface StationLabelDriverProps {
  labels: StationLabelVisual[]
  labelRefs: RefObject<Map<string, HTMLDivElement>>
}

export function StationLabelDriver({
  labels,
  labelRefs,
}: StationLabelDriverProps) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const labelsVisible = useViewerStore((state) => state.labelsVisible)
  const inferredVisible = useViewerStore((state) => state.inferredVisible)
  const visibilityRef = useRef(new Map<string, boolean>())
  const projected = useMemo(() => new Vector3(), [])

  useFrame(() => {
    const setVisible = (
      stationId: string,
      element: HTMLDivElement,
      visible: boolean,
    ) => {
      if (visibilityRef.current.get(stationId) === visible) {
        return
      }
      visibilityRef.current.set(stationId, visible)
      element.style.visibility = visible ? 'visible' : 'hidden'
    }

    if (!labelsVisible) {
      for (const label of labels) {
        const element = labelRefs.current.get(label.stationId)
        if (element) {
          setVisible(label.stationId, element, false)
        }
      }
      return
    }

    const candidates: Array<{
      label: StationLabelVisual
      element: HTMLDivElement
      x: number
      y: number
      priority: number
      distance: number
    }> = []

    for (const label of labels) {
      const element = labelRefs.current.get(label.stationId)
      if (!element) {
        continue
      }

      if (!inferredVisible && label.allUnknown) {
        setVisible(label.stationId, element, false)
        continue
      }

      projected.copy(label.position).project(camera)
      if (projected.z < -1 || projected.z > 1) {
        setVisible(label.stationId, element, false)
        continue
      }

      const x = (projected.x * 0.5 + 0.5) * size.width
      const y = (-projected.y * 0.5 + 0.5) * size.height
      const rightMargin = size.width < 700 ? 76 : 110

      if (
        x < 6 ||
        x > size.width - rightMargin ||
        y < 70 ||
        y > size.height - 20
      ) {
        setVisible(label.stationId, element, false)
        continue
      }

      candidates.push({
        label,
        element,
        x,
        y,
        priority: label.interchange ? 0 : 1,
        distance: camera.position.distanceTo(label.position),
      })
    }

    candidates.sort(
      (a, b) => a.priority - b.priority || a.distance - b.distance,
    )

    const kept: Array<{ x: number; y: number }> = []
    const visibleCandidates: typeof candidates = []
    for (const candidate of candidates) {
      const clear = kept.every(
        (point) =>
          Math.hypot(point.x - candidate.x, point.y - candidate.y) > 44,
      )

      candidate.element.style.transform =
        `translate3d(${candidate.x}px,${candidate.y}px,0) translateY(-100%)`

      if (!clear) {
        setVisible(candidate.label.stationId, candidate.element, false)
        continue
      }

      setVisible(candidate.label.stationId, candidate.element, true)
      kept.push({ x: candidate.x, y: candidate.y })
      visibleCandidates.push(candidate)
    }

    visibleCandidates.sort((a, b) => a.distance - b.distance)
    const zMax = visibleCandidates.length
    visibleCandidates.forEach((candidate, index) => {
      candidate.element.style.zIndex = `${zMax - index}`
    })
  })

  return null
}
