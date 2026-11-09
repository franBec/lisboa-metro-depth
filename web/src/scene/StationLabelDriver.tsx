import { useFrame, useThree } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import { Vector3 } from 'three'
import { useViewerStore } from '../state/viewerStore'
import type { LandmarkLabelVisual } from './landmarkVisuals'
import type { StationLabelVisual } from './stationVisuals'

interface StationLabelDriverProps {
  labels: StationLabelVisual[]
  labelRefs: RefObject<Map<string, HTMLButtonElement>>
  landmarkLabels: LandmarkLabelVisual[]
  landmarkLabelRefs: RefObject<Map<string, HTMLButtonElement>>
}

interface LabelCandidate {
  element: HTMLButtonElement
  key: string
  state: Map<string, boolean>
  x: number
  y: number
  priority: number
  distance: number
}

export function StationLabelDriver({
  labels,
  labelRefs,
  landmarkLabels,
  landmarkLabelRefs,
}: StationLabelDriverProps) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const labelsVisible = useViewerStore((state) => state.labelsVisible)
  const landmarksVisible = useViewerStore((state) => state.landmarksVisible)
  const inferredVisible = useViewerStore((state) => state.inferredVisible)
  const stationVisibility = useRef(new Map<string, boolean>())
  const landmarkVisibility = useRef(new Map<string, boolean>())
  const projected = useRef(new Vector3()).current

  useFrame(() => {
    const setVisible = (
      key: string,
      element: HTMLButtonElement,
      visible: boolean,
      state: Map<string, boolean>,
    ) => {
      if (state.get(key) === visible) {
        return
      }
      state.set(key, visible)
      element.style.visibility = visible ? 'visible' : 'hidden'
    }

    if (!labelsVisible) {
      for (const label of labels) {
        const element = labelRefs.current.get(label.stationId)
        if (element) {
          setVisible(label.stationId, element, false, stationVisibility.current)
        }
      }
      for (const label of landmarkLabels) {
        const element = landmarkLabelRefs.current.get(label.id)
        if (element) {
          setVisible(label.id, element, false, landmarkVisibility.current)
        }
      }
      return
    }

    if (!landmarksVisible) {
      for (const label of landmarkLabels) {
        const element = landmarkLabelRefs.current.get(label.id)
        if (element) {
          setVisible(label.id, element, false, landmarkVisibility.current)
        }
      }
    }

    const candidates: LabelCandidate[] = []

    for (const label of labels) {
      const element = labelRefs.current.get(label.stationId)
      if (!element) {
        continue
      }

      if (!inferredVisible && label.allUnknown) {
        setVisible(label.stationId, element, false, stationVisibility.current)
        continue
      }

      projected.copy(label.position).project(camera)
      if (projected.z < -1 || projected.z > 1) {
        setVisible(label.stationId, element, false, stationVisibility.current)
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
        setVisible(label.stationId, element, false, stationVisibility.current)
        continue
      }

      candidates.push({
        key: label.stationId,
        element,
        state: stationVisibility.current,
        x,
        y,
        priority: label.interchange ? 0 : 1,
        distance: camera.position.distanceTo(label.position),
      })
    }

    if (landmarksVisible) {
      for (const label of landmarkLabels) {
        const element = landmarkLabelRefs.current.get(label.id)
        if (!element) {
          continue
        }

        projected.copy(label.position).project(camera)
        if (projected.z < -1 || projected.z > 1) {
          setVisible(label.id, element, false, landmarkVisibility.current)
          continue
        }

        const x = (projected.x * 0.5 + 0.5) * size.width
        const y = (-projected.y * 0.5 + 0.5) * size.height
        const rightMargin = size.width < 700 ? 60 : 90

        if (
          x < 6 ||
          x > size.width - rightMargin ||
          y < 48 ||
          y > size.height - 20
        ) {
          setVisible(label.id, element, false, landmarkVisibility.current)
          continue
        }

        candidates.push({
          key: label.id,
          element,
          state: landmarkVisibility.current,
          x,
          y,
          priority: 2,
          distance: camera.position.distanceTo(label.position),
        })
      }
    }

    candidates.sort(
      (a, b) => a.priority - b.priority || a.distance - b.distance,
    )

    const kept: Array<{ x: number; y: number }> = []
    const visibleCandidates: LabelCandidate[] = []
    for (const candidate of candidates) {
      const conflict = kept.find(
        (point) =>
          Math.hypot(point.x - candidate.x, point.y - candidate.y) <= 44,
      )

      // Station labels win collisions. Nudge a losing landmark label away
      // from the winning point so very close landmarks stay readable.
      if (conflict && candidate.priority === 2) {
        const width = candidate.element.offsetWidth
        const direction = candidate.x >= conflict.x ? 1 : -1
        const shiftedX = candidate.x + direction * (width + 18)
        if (shiftedX > 6 && shiftedX < size.width - 90) {
          candidate.x = shiftedX
        }
      }

      const clear = kept.every(
        (point) =>
          Math.hypot(point.x - candidate.x, point.y - candidate.y) > 44,
      )

      candidate.element.style.transform =
        `translate3d(${candidate.x}px,${candidate.y}px,0) translateY(-100%)`

      setVisible(
        candidate.key,
        candidate.element,
        clear,
        candidate.state,
      )
      if (!clear) {
        continue
      }

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
