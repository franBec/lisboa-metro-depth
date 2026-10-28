import { Raycaster, Vector2, Vector3 } from 'three'
import { loadViewerData } from './data'
import { HeightField, Projection } from './geo'
import { createScene } from './scene'
import { buildStations, type StationLayer } from './stations'
import { buildTerrain, type TerrainLayer } from './terrain'
import { buildTunnels, type TunnelLayer } from './tunnels'
import type { Network, Station, ViewerData } from './types'
import { ViewerUI } from './ui'

const container = document.getElementById('scene-container')
const labelLayer = document.getElementById('label-layer')
if (!container || !labelLayer) {
  throw new Error('viewer containers missing')
}

let state: {
  data: ViewerData
  projection: Projection
  heightField: HeightField
  scene: ReturnType<typeof createScene>
  ui: ViewerUI
  lineColors: Map<string, string>
  selectedLines: Set<string>
  verticalScale: number
  labelsVisible: boolean
  xray: boolean
  inferredVisible: boolean
  terrain: TerrainLayer | null
  tunnels: TunnelLayer | null
  stations: StationLayer | null
  selectedStation: Station | null
  focus: {
    fromCamera: Vector3
    toCamera: Vector3
    fromTarget: Vector3
    toTarget: Vector3
    start: number
    duration: number
  } | null
}

async function boot(): Promise<void> {
  const data = await loadViewerData()
  const projection = new Projection(data.manifest)
  const heightField = new HeightField(
    data.heights,
    data.manifest.terrain.width,
    data.manifest.terrain.height,
    projection,
  )
  const scene = createScene(container!, labelLayer!, projection)
  const { widthM, heightM } = projection.bounds
  const targetY = data.manifest.terrain.max_m * 2.5
  scene.controls.target.set(0, targetY, 0)
  scene.camera.position.set(widthM * 0.52, targetY + heightM * 0.58, heightM * 0.68)
  scene.controls.update()
  if (container!.clientWidth / Math.max(container!.clientHeight, 1) < 1) {
    const target = scene.controls.target.clone()
    scene.camera.position.sub(target).multiplyScalar(1.55).add(target)
    scene.controls.update()
  }
  const params = new URLSearchParams(window.location.search)
  const selectedLines = parseLines(data.network, params)
  const initialStation = params.get('station')
  const initialXRay = params.get('xray') === '1'

  const ui = new ViewerUI(data.manifest, data.network.lines, {
    onLineToggle: (lineId) => toggleLine(lineId),
    onLabelsToggle: (visible) => {
      state.labelsVisible = visible
      state.stations?.setLabelsVisible(visible)
    },
    onXRayToggle: (enabled) => {
      state.xray = enabled
      state.terrain?.setXRay(enabled)
      updateUrl(false)
    },
    onInferredToggle: (visible) => {
      state.inferredVisible = visible
      state.tunnels?.setInferredVisible(visible)
      state.stations?.setInferredVisible(visible)
    },
    onScaleChange: (scale) => setScale(scale),
    onCloseStation: () => {
      state.selectedStation = null
      state.ui.setStationVisible(false)
      updateUrl(false)
    },
  })

  state = {
    data,
    projection,
    heightField,
    scene,
    ui,
    lineColors: new Map(data.network.lines.map((line) => [line.id, line.color])),
    selectedLines,
    verticalScale: 10,
    labelsVisible: true,
    xray: initialXRay,
    inferredVisible: true,
    terrain: null,
    tunnels: null,
    stations: null,
    selectedStation: null,
    focus: null,
  }

  buildWorld()
  state.ui.setSelectedLines(state.selectedLines)
  state.ui.setScale(state.verticalScale)
  state.ui.setXRay(initialXRay)
  state.ui.hideLoading()

  if (initialStation) {
    const station = data.stations.find((candidate) => candidate.id === initialStation)
    if (station) {
      selectStation(station, true)
    }
  }

  window.addEventListener('resize', onResize)
  const canvas = scene.renderer.domElement
  let pointerStart: { x: number; y: number } | null = null
  canvas.addEventListener('pointerdown', (event) => {
    pointerStart = { x: event.clientX, y: event.clientY }
  })
  canvas.addEventListener('pointerup', (event) => {
    if (!pointerStart) return
    const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
    pointerStart = null
    if (moved > 6) return
    const station = pickStation(event)
    if (station) {
      selectStation(station, false)
    }
  })
  canvas.addEventListener('dblclick', (event) => {
    const station = pickStation(event)
    if (station) {
      selectStation(station, true)
    }
  })

  animate()
}

function buildWorld(): void {
  const { scene, data, projection, verticalScale } = state
  state.terrain?.dispose()
  state.tunnels?.dispose()
  state.stations?.dispose()
  state.scene.world.clear()

  const terrain = buildTerrain(data.manifest, data.heights, data.texture, verticalScale)
  state.scene.world.add(terrain.group)
  state.terrain = terrain
  terrain.setXRay(state.xray)

  const tunnels = buildTunnels(data.network.lines, projection, verticalScale, scene.renderer)
  state.scene.world.add(tunnels.group)
  state.tunnels = tunnels
  tunnels.resize(container!.clientWidth, container!.clientHeight)
  tunnels.setLineFilter(state.selectedLines.size ? state.selectedLines : null)
  tunnels.setInferredVisible(state.inferredVisible)

  const stations = buildStations(data.stations, data.network.lines, projection, verticalScale)
  state.scene.world.add(stations.group)
  state.stations = stations
  stations.setLabelsVisible(state.labelsVisible)
  stations.setLineFilter(state.selectedLines.size ? state.selectedLines : null)
  stations.setInferredVisible(state.inferredVisible)

  if (state.selectedStation) {
    state.ui.showStation(state.selectedStation, state.lineColors)
  }
}

function toggleLine(lineId: string): void {
  if (state.selectedLines.has(lineId)) {
    state.selectedLines.delete(lineId)
  } else {
    state.selectedLines.add(lineId)
  }
  const filter = state.selectedLines.size ? state.selectedLines : null
  state.ui.setSelectedLines(state.selectedLines)
  state.tunnels?.setLineFilter(filter)
  state.stations?.setLineFilter(filter)
  updateUrl(true)
}

function setScale(scale: number): void {
  state.verticalScale = scale
  state.ui.setScale(scale)
  buildWorld()
  updateUrl(false)
}

function selectStation(station: Station, focus: boolean): void {
  state.selectedStation = station
  state.ui.showStation(station, state.lineColors)
  updateUrl(false)
  if (focus) focusStation(station)
}

function focusStation(station: Station): void {
  const { projection, verticalScale, scene } = state
  const { x, z } = projection.toWorld(station.lat, station.lon)
  const depths = station.platforms
    .map((platform) => platform.platform_depth_m)
    .filter((depth): depth is number => depth !== null)
  const targetDepth = depths.length ? depths.reduce((sum, depth) => sum + depth, 0) / depths.length : 0
  const target = new Vector3(
    x,
    (station.surface_elevation_m - targetDepth / 2) * verticalScale,
    z,
  )
  const direction = scene.camera.position.clone().sub(scene.controls.target).normalize()
  const distance = Math.min(Math.max(1300, scene.camera.position.distanceTo(scene.controls.target) * 0.45), 4200)
  const toCamera = target.clone().add(direction.multiplyScalar(distance))
  state.focus = {
    fromCamera: scene.camera.position.clone(),
    toCamera,
    fromTarget: scene.controls.target.clone(),
    toTarget: target,
    start: performance.now(),
    duration: 900,
  }
}

function pickStation(event: MouseEvent | PointerEvent): Station | null {
  if (!state.stations) return null
  const canvas = state.scene.renderer.domElement
  const rect = canvas.getBoundingClientRect()
  const mouse = new Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  const raycaster = new Raycaster()
  raycaster.setFromCamera(mouse, state.scene.camera)
  const hits = raycaster.intersectObjects(state.stations.pickables, true)
  for (const hit of hits) {
    const stationId = hit.object.userData.stationId as string | undefined
    if (!stationId) continue
    const station = state.data.stations.find((candidate) => candidate.id === stationId)
    if (station) return station
  }
  return null
}

function parseLines(network: Network, params: URLSearchParams): Set<string> {
  const raw = params.get('line')
  if (!raw) return new Set()
  const valid = new Set(network.lines.map((line) => line.id))
  return new Set(raw.split(',').map((value) => value.trim()).filter((value) => valid.has(value)))
}

function updateUrl(push: boolean): void {
  const url = new URL(window.location.href)
  if (state.selectedLines.size) {
    url.searchParams.set('line', [...state.selectedLines].sort().join(','))
  } else {
    url.searchParams.delete('line')
  }
  if (state.selectedStation) {
    url.searchParams.set('station', state.selectedStation.id)
  } else {
    url.searchParams.delete('station')
  }
  if (state.xray) {
    url.searchParams.set('xray', '1')
  } else {
    url.searchParams.delete('xray')
  }
  const next = `${url.pathname}${url.search}`
  window.history[push ? 'pushState' : 'replaceState'](null, '', next)
}

function onResize(): void {
  state.scene.resize()
  state.tunnels?.resize(container!.clientWidth, container!.clientHeight)
}

function animate(): void {
  requestAnimationFrame(animate)
  const { scene } = state
  if (state.focus) {
    const progress = Math.min((performance.now() - state.focus.start) / state.focus.duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    scene.camera.position.lerpVectors(state.focus.fromCamera, state.focus.toCamera, eased)
    scene.controls.target.lerpVectors(state.focus.fromTarget, state.focus.toTarget, eased)
    if (progress >= 1) {
      state.focus = null
    }
  }
  scene.controls.update()
  state.stations?.updateLabels(
    scene.camera,
    container!.clientWidth,
    container!.clientHeight,
  )
  scene.renderer.render(scene.scene, scene.camera)
  scene.labelRenderer.render(scene.scene, scene.camera)
}

boot().catch((error: unknown) => {
  console.error(error)
  const message = error instanceof Error ? error.message : String(error)
  const overlay = document.getElementById('error')
  const text = document.getElementById('error-text')
  const loading = document.getElementById('loading')
  if (loading) loading.hidden = true
  if (overlay) overlay.hidden = false
  if (text) text.textContent = message
})
