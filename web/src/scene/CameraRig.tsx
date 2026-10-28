import type { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  useEffect,
  useRef,
  type ComponentRef,
  type RefObject,
} from 'react'
import { Vector3 } from 'three'
import type { Manifest, Station } from '../data/schemas'
import type { Projection } from '../lib/geo'
import { useViewerStore } from '../state/viewerStore'

type OrbitControlsInstance = ComponentRef<typeof OrbitControls>

interface FocusAnimation {
  fromCamera: Vector3
  toCamera: Vector3
  fromTarget: Vector3
  toTarget: Vector3
  start: number
  duration: number
  nonce: number
}

interface CameraRigProps {
  manifest: Manifest
  projection: Projection
  stations: Station[]
  controlsRef: RefObject<OrbitControlsInstance | null>
}

export function CameraRig({
  manifest,
  projection,
  stations,
  controlsRef,
}: CameraRigProps) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const focusRequest = useViewerStore((state) => state.focusRequest)
  const clearFocusRequest = useViewerStore((state) => state.clearFocusRequest)
  const focusAnimation = useRef<FocusAnimation | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) {
      return
    }

    const controls = controlsRef.current
    if (!controls) {
      return
    }
    initialized.current = true

    const { widthM, heightM } = projection.bounds
    const targetY = manifest.terrain.max_m * 2.5
    const target = new Vector3(0, targetY, 0)

    controls.target.copy(target)
    camera.position.set(
      widthM * 0.52,
      targetY + heightM * 0.58,
      heightM * 0.68,
    )

    if (size.width / Math.max(size.height, 1) < 1) {
      camera.position.sub(target).multiplyScalar(1.55).add(target)
    }

    controls.update()
  }, [camera, controlsRef, manifest, projection, size])

  useEffect(() => {
    if (!focusRequest) {
      return
    }

    const controls = controlsRef.current
    if (!controls) {
      return
    }

    const station = stations.find(
      (candidate) => candidate.id === focusRequest.stationId,
    )
    if (!station) {
      clearFocusRequest(focusRequest.nonce)
      return
    }

    const { x, z } = projection.toWorld(station.lat, station.lon)
    const depths = station.platforms
      .map((platform) => platform.platform_depth_m)
      .filter((depth): depth is number => depth !== null)
    const targetDepth = depths.length
      ? depths.reduce((sum, depth) => sum + depth, 0) / depths.length
      : 0
    const verticalScale = useViewerStore.getState().verticalScale
    const target = new Vector3(
      x,
      (station.surface_elevation_m - targetDepth / 2) * verticalScale,
      z,
    )

    const direction = camera.position
      .clone()
      .sub(controls.target)
      .normalize()
    const distance = Math.min(
      Math.max(1300, camera.position.distanceTo(controls.target) * 0.45),
      4200,
    )
    const toCamera = target.clone().add(direction.multiplyScalar(distance))

    focusAnimation.current = {
      fromCamera: camera.position.clone(),
      toCamera,
      fromTarget: controls.target.clone(),
      toTarget: target,
      start: performance.now(),
      duration: 900,
      nonce: focusRequest.nonce,
    }
  }, [camera, clearFocusRequest, controlsRef, focusRequest, projection, stations])

  useFrame(() => {
    const animation = focusAnimation.current
    const controls = controlsRef.current
    if (!animation || !controls) {
      return
    }

    const progress = Math.min(
      (performance.now() - animation.start) / animation.duration,
      1,
    )
    const eased = 1 - Math.pow(1 - progress, 3)

    camera.position.lerpVectors(animation.fromCamera, animation.toCamera, eased)
    controls.target.lerpVectors(
      animation.fromTarget,
      animation.toTarget,
      eased,
    )
    controls.update()

    if (progress >= 1) {
      focusAnimation.current = null
      clearFocusRequest(animation.nonce)
    }
  })

  return null
}
