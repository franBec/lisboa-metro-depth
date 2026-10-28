import {
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { Projection } from './geo'

export interface SceneContext {
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  labelRenderer: CSS2DRenderer
  controls: OrbitControls
  world: Group
  resize: () => void
}

export function createScene(
  container: HTMLElement,
  labelContainer: HTMLElement,
  projection: Projection,
): SceneContext {
  const scene = new Scene()
  scene.background = new Color('#0b0f10')
  scene.fog = new FogExp2(new Color('#0b0f10'), 0.000035)

  const camera = new PerspectiveCamera(
    42,
    container.clientWidth / Math.max(container.clientHeight, 1),
    5,
    60000,
  )
  const { widthM, heightM } = projection.bounds
  camera.position.set(widthM * 0.54, heightM * 0.72, heightM * 0.78)

  const renderer = new WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.outputColorSpace = 'srgb'
  container.appendChild(renderer.domElement)

  const labelRenderer = new CSS2DRenderer({ element: labelContainer })
  labelRenderer.setSize(container.clientWidth, container.clientHeight)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.075
  controls.target.set(0, 0, 0)
  controls.minDistance = 900
  controls.maxDistance = 32000
  controls.maxPolarAngle = Math.PI * 0.495
  controls.update()

  const hemisphere = new HemisphereLight(new Color('#c9dde0'), new Color('#191b15'), 2.2)
  scene.add(hemisphere)

  const sun = new DirectionalLight(new Color('#ffe8c4'), 2.4)
  sun.position.set(-widthM * 0.45, heightM * 0.9, -heightM * 0.55)
  scene.add(sun)

  const fill = new DirectionalLight(new Color('#66899c'), 0.9)
  fill.position.set(widthM * 0.55, heightM * 0.35, heightM * 0.7)
  scene.add(fill)

  const world = new Group()
  scene.add(world)

  const resize = () => {
    const width = container.clientWidth
    const height = Math.max(container.clientHeight, 1)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    labelRenderer.setSize(width, height)
  }

  return { scene, camera, renderer, labelRenderer, controls, world, resize }
}
