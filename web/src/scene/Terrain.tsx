import { useTexture } from '@react-three/drei'
import { useCallback, useEffect, useMemo } from 'react'
import { DoubleSide, SRGBColorSpace, type Texture } from 'three'
import { terrainTextureUrl } from '../data/client'
import type { Manifest } from '../data/schemas'
import { useViewerStore } from '../state/viewerStore'
import {
  buildTerrainSurface,
  buildTerrainWalls,
  terrainBottomY,
} from './terrainGeometry'

interface TerrainProps {
  manifest: Manifest
  heights: Float32Array
  verticalScale: number
  xray: boolean
}

export function Terrain({
  manifest,
  heights,
  verticalScale,
  xray,
}: TerrainProps) {
  const setSceneReady = useViewerStore((state) => state.setSceneReady)
  const handleTextureLoad = useCallback(
    (loaded: Texture) => {
      loaded.colorSpace = SRGBColorSpace
      loaded.anisotropy = 8
      loaded.needsUpdate = true
      setSceneReady(true)
    },
    [setSceneReady],
  )
  const texture = useTexture(
    terrainTextureUrl(manifest),
    handleTextureLoad,
  )

  const widthM = manifest.terrain.size_m.width
  const heightM = manifest.terrain.size_m.height

  const topGeometry = useMemo(
    () => buildTerrainSurface(manifest, heights, verticalScale),
    [heights, manifest, verticalScale],
  )
  const wallsGeometry = useMemo(
    () =>
      buildTerrainWalls(
        manifest,
        heights,
        verticalScale,
        terrainBottomY(manifest, verticalScale),
      ),
    [heights, manifest, verticalScale],
  )
  const bottomY = terrainBottomY(manifest, verticalScale)

  useEffect(() => {
    return () => {
      topGeometry.dispose()
      wallsGeometry.dispose()
    }
  }, [topGeometry, wallsGeometry])

  return (
    <group name="terrain">
      <mesh geometry={topGeometry} name="terrain-top">
        <meshStandardMaterial
          key={xray ? 'top-xray' : 'top-solid'}
          map={texture}
          roughness={0.97}
          metalness={0}
          transparent={xray}
          opacity={xray ? 0.2 : 1}
          depthWrite={!xray}
        />
      </mesh>

      <mesh geometry={wallsGeometry} name="terrain-walls">
        <meshBasicMaterial
          key={xray ? 'walls-xray' : 'walls-solid'}
          color="#211f1b"
          side={DoubleSide}
          transparent={xray}
          opacity={xray ? 0.09 : 1}
          depthWrite={!xray}
        />
      </mesh>

      <mesh
        name="terrain-bottom"
        position={[0, bottomY, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[widthM, heightM]} />
        <meshBasicMaterial
          key={xray ? 'bottom-xray' : 'bottom-solid'}
          color="#121413"
          side={DoubleSide}
          transparent={xray}
          opacity={xray ? 0.06 : 1}
          depthWrite={!xray}
        />
      </mesh>
    </group>
  )
}
