import { Shape } from 'three'
import {
  ellipsePlan,
  extrudeThick,
  extrudeUp,
  planShape,
} from './landmarkGeometry'

/**
 * Procedural low-poly landmark shapes, one component per curated landmark.
 * Building masses come from hand-traced footprint outlines (plan space:
 * x=east, y=north, meters) extruded with the helpers in landmarkGeometry.ts;
 * silhouettes with ground-level arches (aqueduct, Augusta arch) use
 * elevation profiles extruded for wall thickness. Real dimensions are noted
 * per component and rendered at the scene's exaggerated scale so silhouettes
 * read at the orbital camera distances the viewport uses.
 *
 * All components are authored with their base at y=0: `Landmarks.tsx`
 * places the group at the landmark's surface elevation, and the silhouette
 * top of each shape is recorded in landmarkModels.ts.
 */

const STONE = '#b3a47f'
const STONE_EMISSIVE = '#4a4331'
const PLASTER = '#d3c9b4'
const PLASTER_EMISSIVE = '#565043'
const TILE = '#9d5c42'
const TILE_EMISSIVE = '#3b2318'
const OCHRE = '#c69a55'
const OCHRE_EMISSIVE = '#4d3a1c'
const GLASS = '#8fb0c4'
const GLASS_EMISSIVE = '#2f4250'
const PITCH = '#3f6b41'
const PITCH_EMISSIVE = '#1b2d17'
const WHITE = '#e3ded1'
const WHITE_EMISSIVE = '#55503f'
const ACCENT_RED = '#a5433f'
const ACCENT_RED_EMISSIVE = '#3a1614'
const IRON = '#5f5b52'
const IRON_EMISSIVE = '#25231e'

interface FlatProps {
  color: string
  emissive: string
  side?: 0 | 1 | 2
}

/** Flat-shaded material with a slight emissive so shapes read in the fog. */
function Flat({ color, emissive, side }: FlatProps) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={emissive}
      emissiveIntensity={0.35}
      roughness={0.9}
      metalness={0.05}
      side={side}
      flatShading
    />
  )
}

function Glass() {
  return (
    <meshStandardMaterial
      color={GLASS}
      emissive={GLASS_EMISSIVE}
      emissiveIntensity={0.7}
      roughness={0.4}
      flatShading
    />
  )
}

/**
 * Castelo de São Jorge. Hilltop enclosure ~260x180m with six angle towers,
 * walls ~14m, honest exaggeration inherited from the scene scale.
 */
const CASTELO_WALLS = extrudeUp(
  planShape([
    [-118, -64],
    [-60, -88],
    [-8, -92],
    [48, -84],
    [98, -58],
    [112, -18],
    [96, 26],
    [58, 58],
    [4, 74],
    [-56, 66],
    [-92, 34],
    [-110, -6],
  ]),
  22,
  1,
)
const CASTELO_KEEP = extrudeUp(
  planShape([
    [-34, -4],
    [40, -4],
    [40, 44],
    [-34, 44],
  ]),
  26,
  1,
)
const CASTELO_KEEP_TOP = extrudeUp(
  planShape([
    [-38, -8],
    [44, -8],
    [44, 48],
    [-38, 48],
  ]),
  6,
)
const CASTELO_TOWERS: Array<[number, number]> = [
  [-118, -64],
  [-8, -92],
  [112, -18],
  [58, 58],
  [-92, 34],
  [-110, -6],
]

export function CasteloDeSaoJorge() {
  return (
    <group rotation={[0, 0.35, 0]}>
      <mesh geometry={CASTELO_WALLS}>
        <Flat color={STONE} emissive={STONE_EMISSIVE} />
      </mesh>
      <mesh geometry={CASTELO_KEEP}>
        <Flat color={PLASTER} emissive={PLASTER_EMISSIVE} />
      </mesh>
      <mesh geometry={CASTELO_KEEP_TOP} position={[0, 26, 0]}>
        <Flat color={TILE} emissive={TILE_EMISSIVE} />
      </mesh>
      {CASTELO_TOWERS.map(([x, z]) => (
        <group key={`${x}:${z}`} position={[x, 0, -z]}>
          {/* Plan y (north) was baked to world -z; tower coords stay plan. */}
          <mesh position={[0, 20, 0]}>
            <cylinderGeometry args={[13, 14, 40, 8]} />
            <Flat color={STONE} emissive={STONE_EMISSIVE} />
          </mesh>
          <mesh position={[0, 46, 0]}>
            <coneGeometry args={[17, 12, 8]} />
            <Flat color={TILE} emissive={TILE_EMISSIVE} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/**
 * Sé de Lisboa. Nave ~50m long, 26m wide, twin west bell towers ~38m, apse
 * to the east; facade faces west (-x) as in reality.
 */
const SE_NAVE = extrudeUp(
  planShape([
    [-18, -13],
    [30, -13],
    [30, 13],
    [-18, 13],
  ]),
  28,
  0.6,
)
const SE_FRONT = extrudeUp(
  planShape([
    [-35, -3],
    [-18, -3],
    [-18, 3],
    [-35, 3],
  ]),
  24,
  0.6,
)
export function SeDeLisboa() {
  return (
    <group>
      <mesh geometry={SE_NAVE}>
        <Flat color={PLASTER} emissive={PLASTER_EMISSIVE} />
      </mesh>
      <mesh geometry={SE_FRONT} position={[0, 0, 0]}>
        <Flat color={STONE} emissive={STONE_EMISSIVE} />
      </mesh>
      {/* Twin bell towers flanking the west front */}
      {[11.5, -11.5].map((y) => (
        <group key={y} position={[0, 0, -y]}>
          <mesh position={[-26.5, 28, 0]}>
            <boxGeometry args={[17, 56, 17]} />
            <Flat color={STONE} emissive={STONE_EMISSIVE} />
          </mesh>
          <mesh position={[-26.5, 58, 0]}>
            <boxGeometry args={[19, 4, 19]} />
            <Flat color={TILE} emissive={TILE_EMISSIVE} />
          </mesh>
        </group>
      ))}
      {/* Rose window on the west facade */}
      <mesh position={[-36, 16, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <circleGeometry args={[4.5, 12]} />
        <Glass />
      </mesh>
    </group>
  )
}

/**
 * Praça do Comércio. Arcade square ~250x170m opening toward the river (the
 * south plan edge), with the Augusta street arch and the equestrian statue
 * plinth. The arch trunk is an elevation profile so the opening reads.
 */
const PRACA_ARCADE = extrudeUp(
  planShape([
    [-125, -25],
    [-125, 73],
    [125, 73],
    [125, -25],
    [103, -25],
    [103, 52],
    [-103, 52],
    [-103, -25],
  ]),
  22,
  0.8,
)
const PRACA_ARCH_SHAPE = new Shape()
PRACA_ARCH_SHAPE.moveTo(-23, 0)
PRACA_ARCH_SHAPE.lineTo(-10, 0)
PRACA_ARCH_SHAPE.lineTo(-10, 24)
PRACA_ARCH_SHAPE.absarc(0, 24, 10, Math.PI, 0, true)
PRACA_ARCH_SHAPE.lineTo(10, 0)
PRACA_ARCH_SHAPE.lineTo(23, 0)
PRACA_ARCH_SHAPE.lineTo(23, 40)
PRACA_ARCH_SHAPE.lineTo(-23, 40)
PRACA_ARCH_SHAPE.closePath()
const PRACA_ARCH = extrudeThick(PRACA_ARCH_SHAPE, 14)

export function PracaDoComercio() {
  return (
    <group>
      <mesh geometry={PRACA_ARCADE}>
        <Flat color={OCHRE} emissive={OCHRE_EMISSIVE} />
      </mesh>
      {/* Augusta street arch in the north wing, crown cornice above */}
      <mesh geometry={PRACA_ARCH} position={[0, 0, -79]}>
        <Flat color={OCHRE} emissive={OCHRE_EMISSIVE} />
      </mesh>
      <mesh position={[0, 42, -79]}>
        <boxGeometry args={[46, 4, 14]} />
        <Flat color={OCHRE} emissive={OCHRE_EMISSIVE} />
      </mesh>
      {/* Equestrian statue plinth at the square's center */}
      <mesh position={[0, 3.5, 0]}>
        <cylinderGeometry args={[10, 12, 7, 8]} />
        <Flat color={STONE} emissive={STONE_EMISSIVE} />
      </mesh>
      <mesh position={[0, 10.5, 0]}>
        <boxGeometry args={[9, 7, 7]} />
        <Flat color={STONE} emissive={STONE_EMISSIVE} />
      </mesh>
    </group>
  )
}

/**
 * Estádio da Luz. Bowl plan ~250x220m stepped in two rings (lower and upper
 * seating tiers as true ellipse extrusions), roof band and pitch floor.
 */
const LUZ_LOWER = extrudeUp(
  ellipsePlan(175, 150, { rx: 138, ry: 117 }),
  16,
  0.8,
)
const LUZ_UPPER = extrudeUp(
  ellipsePlan(163, 138, { rx: 106, ry: 88 }),
  30,
  0.8,
)
const LUZ_ROOF = extrudeUp(
  ellipsePlan(172, 145, { rx: 146, ry: 123 }),
  4,
)
const LUZ_PITCH = extrudeUp(ellipsePlan(96, 80, null), 2)

export function EstadioDaLuz() {
  return (
    <group>
      <mesh geometry={LUZ_LOWER}>
        <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
      </mesh>
      <mesh geometry={LUZ_UPPER} position={[0, 8, 0]}>
        <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
      </mesh>
      <mesh geometry={LUZ_PITCH} position={[0, 3, 0]}>
        <Flat color={PITCH} emissive={PITCH_EMISSIVE} />
      </mesh>
      <mesh geometry={LUZ_ROOF} position={[0, 42, 0]}>
        <Glass />
      </mesh>
    </group>
  )
}

/**
 * Estádio José Alvalade. Bowl ~150m across with the coloured steel struts
 * ringing the facade, using the same extruded-ring recipe as the Luz.
 */
const ALVALADE_LOWER = extrudeUp(
  ellipsePlan(158, 132, { rx: 120, ry: 100 }),
  14,
  0.8,
)
const ALVALADE_UPPER = extrudeUp(
  ellipsePlan(138, 116, { rx: 92, ry: 77 }),
  26,
  0.8,
)
const ALVALADE_ROOF = extrudeUp(
  ellipsePlan(145, 122, { rx: 118, ry: 99 }),
  4,
)
const ALVALADE_PITCH = extrudeUp(ellipsePlan(70, 58, null), 2)
const ALVALADE_POSTS: Array<[number, number, string, string]> = Array.from(
  { length: 12 },
  (_, i) => {
    const angle = (i / 12) * Math.PI * 2
    return [
      Math.cos(angle) * 163,
      Math.sin(angle) * 136,
      i % 2 === 0 ? WHITE : ACCENT_RED,
      i % 2 === 0 ? WHITE_EMISSIVE : ACCENT_RED_EMISSIVE,
    ] as [number, number, string, string]
  },
)

export function EstadioJoseAlvalade() {
  return (
    <group>
      <mesh geometry={ALVALADE_LOWER}>
        <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
      </mesh>
      <mesh geometry={ALVALADE_UPPER} position={[0, 6, 0]}>
        <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
      </mesh>
      <mesh geometry={ALVALADE_PITCH} position={[0, 3, 0]}>
        <Flat color={PITCH} emissive={PITCH_EMISSIVE} />
      </mesh>
      <mesh geometry={ALVALADE_ROOF} position={[0, 36, 0]}>
        <Glass />
      </mesh>
      {ALVALADE_POSTS.map(([x, y, color, emissive]) => (
        // plan y (north) -> world -z
        <mesh key={`${x}:${y}`} position={[x, 16, -y]}>
          <boxGeometry args={[6, 32, 6]} />
          <Flat color={color} emissive={emissive} />
        </mesh>
      ))}
    </group>
  )
}

/** Museu Calouste Gulbenkian. Real low wings ~120m long, ~10m tall. */
const GULBENKIAN_WEST = extrudeUp(
  planShape([
    [-142, -33],
    [-22, -33],
    [-22, -7],
    [-142, -7],
  ]),
  10,
  0.5,
)
const GULBENKIAN_EAST = extrudeUp(
  planShape([
    [22, 7],
    [142, 7],
    [142, 33],
    [22, 33],
  ]),
  10,
  0.5,
)
const GULBENKIAN_ATRIUM = extrudeUp(
  planShape([
    [-24, -12],
    [24, -12],
    [24, 12],
    [-24, 12],
  ]),
  8,
)

export function MuseuGulbenkian() {
  return (
    <group rotation={[0, 0.35, 0]}>
      <mesh geometry={GULBENKIAN_WEST}>
        <Flat color={PLASTER} emissive={PLASTER_EMISSIVE} />
      </mesh>
      <mesh geometry={GULBENKIAN_EAST}>
        <Flat color={PLASTER} emissive={PLASTER_EMISSIVE} />
      </mesh>
      <mesh geometry={GULBENKIAN_ATRIUM}>
        <Glass />
      </mesh>
    </group>
  )
}

/**
 * Aeroporto de Lisboa. Terminal hall ~280m long with two north piers, the
 * glazed landside band, and the control tower at the east end.
 */
const AEROPORTO_MAIN = extrudeUp(
  planShape([
    [-150, -36],
    [128, -36],
    [128, 36],
    [-150, 36],
  ]),
  20,
  1,
)
const AEROPORTO_PIER_A = extrudeUp(
  planShape([
    [-140, 36],
    [-64, 36],
    [-64, 72],
    [-140, 72],
  ]),
  14,
)
const AEROPORTO_PIER_B = extrudeUp(
  planShape([
    [-8, 36],
    [72, 36],
    [72, 64],
    [-8, 64],
  ]),
  14,
)
const AEROPORTO_FORECOURT = extrudeUp(
  planShape([
    [-128, -38],
    [104, -38],
    [104, -34],
    [-128, -34],
  ]),
  5,
)

export function Aeroporto() {
  return (
    <group rotation={[0, 0.18, 0]}>
      <mesh geometry={AEROPORTO_MAIN}>
        <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
      </mesh>
      <mesh geometry={AEROPORTO_PIER_A}>
        <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
      </mesh>
      <mesh geometry={AEROPORTO_PIER_B}>
        <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
      </mesh>
      <mesh geometry={AEROPORTO_FORECOURT} position={[0, 4, 0]}>
        <Glass />
      </mesh>
      {/* Control tower at the east end */}
      <mesh position={[146, 90, -20]}>
        <cylinderGeometry args={[10.5, 12, 180, 8]} />
        <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
      </mesh>
      <mesh position={[146, 187, -20]}>
        <cylinderGeometry args={[14, 10.5, 14, 8]} />
        <Glass />
      </mesh>
    </group>
  )
}

/**
 * Elevador de Santa Justa. The 45 m iron lift is drawn at the scene's
 * vertical exaggeration: stone base, four open iron columns, viewing deck,
 * glazed cabin and spire.
 */
export function ElevadorDeSantaJusta() {
  const columns: Array<[number, number]> = [
    [-6, -5],
    [-6, 5],
    [6, -5],
    [6, 5],
  ]
  return (
    <group rotation={[0, 0.35, 0]}>
      <mesh position={[0, 5, 0]}>
        <boxGeometry args={[22, 10, 18]} />
        <Flat color={STONE} emissive={STONE_EMISSIVE} />
      </mesh>
      <mesh position={[0, 28, 0]}>
        <boxGeometry args={[10, 40, 10]} />
        <Flat color={IRON} emissive={IRON_EMISSIVE} />
      </mesh>
      {columns.map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, 30, z]}>
          <boxGeometry args={[2.4, 44, 2.4]} />
          <Flat color={IRON} emissive={IRON_EMISSIVE} />
        </mesh>
      ))}
      <mesh position={[0, 54, 0]}>
        <boxGeometry args={[20, 3, 18]} />
        <Flat color={STONE} emissive={STONE_EMISSIVE} />
      </mesh>
      <mesh position={[0, 61, 0]}>
        <boxGeometry args={[14, 11, 12]} />
        <Glass />
      </mesh>
      <mesh position={[0, 68.5, 0]}>
        <coneGeometry args={[9, 7, 8]} />
        <Flat color={TILE} emissive={TILE_EMISSIVE} />
      </mesh>
    </group>
  )
}

/**
 * Arco da Rua Augusta. 30 m triumphal arch shown at the scene scale: one
 * deep arch opening, side pylons and a heavy attic cornice.
 */
const ARCO_SHAPE = new Shape()
ARCO_SHAPE.moveTo(-15, 0)
ARCO_SHAPE.lineTo(-8, 0)
ARCO_SHAPE.lineTo(-8, 20)
ARCO_SHAPE.absarc(0, 20, 8, Math.PI, 0, true)
ARCO_SHAPE.lineTo(8, 0)
ARCO_SHAPE.lineTo(15, 0)
ARCO_SHAPE.lineTo(15, 44)
ARCO_SHAPE.lineTo(-15, 44)
ARCO_SHAPE.closePath()
const ARCO_BAND = extrudeThick(ARCO_SHAPE, 12)

export function ArcoRuaAugusta() {
  return (
    <group rotation={[0, 0.15, 0]}>
      <mesh geometry={ARCO_BAND} position={[0, 0, -6]}>
        <Flat color={STONE} emissive={STONE_EMISSIVE} />
      </mesh>
      <mesh position={[0, 47, 0]}>
        <boxGeometry args={[34, 6, 14]} />
        <Flat color={STONE} emissive={STONE_EMISSIVE} />
      </mesh>
      <mesh position={[0, 43.5, 0]}>
        <boxGeometry args={[30, 2, 13]} />
        <Flat color={PLASTER} emissive={PLASTER_EMISSIVE} />
      </mesh>
    </group>
  )
}

/**
 * Panteão Nacional. White marble cross plan, drum, hemispherical dome and
 * lantern; the west portico faces the river.
 */
const PANTEON_BASE = extrudeUp(
  planShape([
    [-28, -24],
    [28, -24],
    [28, 24],
    [-28, 24],
  ]),
  22,
  0.8,
)
const PANTEON_PORTICO = extrudeUp(
  planShape([
    [-12, -34],
    [12, -34],
    [12, -24],
    [-12, -24],
  ]),
  18,
  0.6,
)
const PANTEON_COLUMNS = [-10, -6, -2, 2, 6, 10]

export function PanteaoNacional() {
  return (
    <group rotation={[0, -0.15, 0]}>
      <mesh geometry={PANTEON_BASE}>
        <Flat color={PLASTER} emissive={PLASTER_EMISSIVE} />
      </mesh>
      <mesh geometry={PANTEON_PORTICO}>
        <Flat color={PLASTER} emissive={PLASTER_EMISSIVE} />
      </mesh>
      {PANTEON_COLUMNS.map((x) => (
        <mesh key={x} position={[x, 9, -34]}>
          <cylinderGeometry args={[1.4, 1.4, 18, 6]} />
          <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
        </mesh>
      ))}
      <mesh position={[0, 29, 0]}>
        <cylinderGeometry args={[16, 16, 14, 16]} />
        <Flat color={PLASTER} emissive={PLASTER_EMISSIVE} />
      </mesh>
      <mesh position={[0, 36, 0]}>
        <sphereGeometry args={[14, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
      </mesh>
      <mesh position={[0, 53, 0]}>
        <cylinderGeometry args={[3, 4, 6, 8]} />
        <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
      </mesh>
    </group>
  )
}

/**
 * Estação do Rossio. Long neoclassical facade with a raised central pavilion
 * and two glazed horseshoe-arch entrances.
 */
const ROSSIO_WING = extrudeUp(
  planShape([
    [-64, -10],
    [64, -10],
    [64, 10],
    [-64, 10],
  ]),
  24,
  0.6,
)
const ROSSIO_CENTER = extrudeUp(
  planShape([
    [-20, -14],
    [20, -14],
    [20, 14],
    [-20, 14],
  ]),
  34,
  0.6,
)
const ROSSIO_WING_ROOF = extrudeUp(
  planShape([
    [-66, -12],
    [66, -12],
    [66, 12],
    [-66, 12],
  ]),
  3,
)
const ROSSIO_CENTER_ROOF = extrudeUp(
  planShape([
    [-22, -16],
    [22, -16],
    [22, 16],
    [-22, 16],
  ]),
  3,
)

export function EstacaoDoRossio() {
  return (
    <group rotation={[0, 0.05, 0]}>
      <mesh geometry={ROSSIO_WING}>
        <Flat color={PLASTER} emissive={PLASTER_EMISSIVE} />
      </mesh>
      <mesh geometry={ROSSIO_CENTER}>
        <Flat color={OCHRE} emissive={OCHRE_EMISSIVE} />
      </mesh>
      <mesh geometry={ROSSIO_WING_ROOF} position={[0, 25, 0]}>
        <Flat color={TILE} emissive={TILE_EMISSIVE} />
      </mesh>
      <mesh geometry={ROSSIO_CENTER_ROOF} position={[0, 35.5, 0]}>
        <Flat color={TILE} emissive={TILE_EMISSIVE} />
      </mesh>
      {[-38, 38].map((x) => (
        <mesh key={x} position={[x, 8, 10.2]}>
          <boxGeometry args={[10, 14, 1]} />
          <Glass />
        </mesh>
      ))}
      <mesh position={[0, 39.5, 0]}>
        <boxGeometry args={[8, 5, 6]} />
        <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
      </mesh>
    </group>
  )
}

/**
 * Mercado da Ribeira. 100 m iron market hall with a gabled roof and raised
 * clerestory over the central aisle.
 */
const RIBEIRA_HALL = extrudeUp(
  planShape([
    [-52, -26],
    [52, -26],
    [52, 26],
    [-52, 26],
  ]),
  14,
  0.6,
)
const RIBEIRA_ROOF_SHAPE = new Shape()
RIBEIRA_ROOF_SHAPE.moveTo(-28, 0)
RIBEIRA_ROOF_SHAPE.lineTo(0, 12)
RIBEIRA_ROOF_SHAPE.lineTo(28, 0)
RIBEIRA_ROOF_SHAPE.closePath()
const RIBEIRA_ROOF = extrudeThick(RIBEIRA_ROOF_SHAPE, 104)

export function MercadoDaRibeira() {
  return (
    <group rotation={[0, 0.05, 0]}>
      <mesh geometry={RIBEIRA_HALL}>
        <Flat color={PLASTER} emissive={PLASTER_EMISSIVE} />
      </mesh>
      <mesh geometry={RIBEIRA_ROOF} position={[-52, 14, 0]} rotation={[0, Math.PI / 2, 0]}>
        <Flat color={TILE} emissive={TILE_EMISSIVE} />
      </mesh>
      <mesh position={[0, 28, 0]}>
        <boxGeometry args={[40, 4, 10]} />
        <Glass />
      </mesh>
      <mesh position={[0, 7, 26.2]}>
        <boxGeometry args={[22, 10, 1]} />
        <Glass />
      </mesh>
    </group>
  )
}

/**
 * Praça de Touros do Campo Pequeno. Circular arena ~80 m across with a ring
 * wall, shallow tiled roof, central lantern and four corner towers.
 */
const ARENA_WALL = extrudeUp(ellipsePlan(45, 45, { rx: 37, ry: 37 }), 16, 0.8)
const ARENA_PITCH = extrudeUp(ellipsePlan(32, 32, null), 2)
const ARENA_TOWERS: Array<[number, number]> = [
  [31, 31],
  [-31, 31],
  [31, -31],
  [-31, -31],
]

export function PracaDeTourosCampoPequeno() {
  return (
    <group>
      <mesh geometry={ARENA_WALL}>
        <Flat color={OCHRE} emissive={OCHRE_EMISSIVE} />
      </mesh>
      <mesh geometry={ARENA_PITCH} position={[0, 1.5, 0]}>
        <Flat color={PITCH} emissive={PITCH_EMISSIVE} />
      </mesh>
      <mesh position={[0, 22, 0]}>
        <coneGeometry args={[40, 12, 24]} />
        <Flat color={TILE} emissive={TILE_EMISSIVE} />
      </mesh>
      <mesh position={[0, 30, 0]}>
        <cylinderGeometry args={[3, 4, 4, 8]} />
        <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
      </mesh>
      {ARENA_TOWERS.map(([x, z]) => (
        <group key={`${x}:${z}`} position={[x, 0, z]}>
          <mesh position={[0, 10, 0]}>
            <cylinderGeometry args={[4, 4.5, 20, 8]} />
            <Flat color={OCHRE} emissive={OCHRE_EMISSIVE} />
          </mesh>
          <mesh position={[0, 23, 0]}>
            <coneGeometry args={[5, 6, 8]} />
            <Flat color={TILE} emissive={TILE_EMISSIVE} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/**
 * Gare do Oriente. Long glazed train shed on a podium, with a raised central
 * hall, repeated columns and a clerestory ridge.
 */
const GARE_PODIUM = extrudeUp(
  planShape([
    [-100, -45],
    [100, -45],
    [100, 45],
    [-100, 45],
  ]),
  6,
  0.6,
)
const GARE_HALL = extrudeUp(
  planShape([
    [-42, -24],
    [42, -24],
    [42, 24],
    [-42, 24],
  ]),
  36,
  0.6,
)
const GARE_COLUMN_POSITIONS: Array<[number, number]> = Array.from(
  { length: 9 },
  (_, index) => {
    const x = -80 + index * 20
    return [
      [x, -40],
      [x, 40],
    ] as Array<[number, number]>
  },
).flat()

export function GareDoOriente() {
  return (
    <group rotation={[0, 0.08, 0]}>
      <mesh geometry={GARE_PODIUM}>
        <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
      </mesh>
      <mesh geometry={GARE_HALL} position={[0, 6, 0]}>
        <Flat color={PLASTER} emissive={PLASTER_EMISSIVE} />
      </mesh>
      {GARE_COLUMN_POSITIONS.map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, 24, z]}>
          <boxGeometry args={[3, 36, 3]} />
          <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
        </mesh>
      ))}
      <mesh position={[0, 43, 0]}>
        <boxGeometry args={[184, 2, 88]} />
        <Glass />
      </mesh>
      <mesh position={[0, 46, 0]}>
        <boxGeometry args={[24, 4, 24]} />
        <Glass />
      </mesh>
    </group>
  )
}

/**
 * Pavilhão de Portugal. Two concrete side blocks carry a long suspended
 * canopy over the glass exhibition hall.
 */
export function PavilhaoDePortugal() {
  return (
    <group rotation={[0, -0.12, 0]}>
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[100, 3, 70]} />
        <Flat color={STONE} emissive={STONE_EMISSIVE} />
      </mesh>
      {[-36, 36].map((x) => (
        <mesh key={x} position={[x, 9, 0]}>
          <boxGeometry args={[18, 18, 40]} />
          <Flat color={PLASTER} emissive={PLASTER_EMISSIVE} />
        </mesh>
      ))}
      <mesh position={[0, 13, 0]}>
        <boxGeometry args={[56, 14, 46]} />
        <Glass />
      </mesh>
      <mesh position={[0, 22, 0]}>
        <boxGeometry args={[104, 4, 72]} />
        <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
      </mesh>
      <mesh position={[0, 25, 0]}>
        <boxGeometry args={[40, 2, 12]} />
        <Flat color={WHITE} emissive={WHITE_EMISSIVE} />
      </mesh>
    </group>
  )
}
