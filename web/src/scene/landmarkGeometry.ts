import { ExtrudeGeometry, Path, Shape } from 'three'

/**
 * Building-plan helpers for the procedural low-poly landmarks.
 *
 * Two extrusion conventions:
 * - `extrudeUp`: footprint in plan space (x=east, y=north), extruded
 *   vertically and baked onto the world XZ plane (north becomes -z, matching
 *   Projection in geo.ts). Used for building masses.
 * - `extrudeThick`: profile in elevation space (x across the face, y=up),
 *   extruded along +z for wall thickness. Used for silhouettes with
 *   ground-level arches (aqueduct bays, the Augusta street arch).
 */

export function planShape(vertices: Array<[number, number]>): Shape {
  const shape = new Shape()
  vertices.forEach(([x, y], index) => {
    if (index === 0) {
      shape.moveTo(x, y)
    } else {
      shape.lineTo(x, y)
    }
  })
  shape.closePath()
  return shape
}

/** Ellipse plan, optionally with a concentric elliptical hole (bowl rings). */
export function ellipsePlan(
  rx: number,
  ry: number,
  hole: { rx: number; ry: number } | null,
): Shape {
  const shape = new Shape()
  shape.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0)
  if (hole) {
    const path = new Path()
    path.absellipse(0, 0, hole.rx, hole.ry, 0, Math.PI * 2, true, 0)
    shape.holes.push(path)
  }
  return shape
}

/** Extrude a footprint straight up by `depth`, baked into the XZ plane. */
export function extrudeUp(
  shape: Shape,
  depth: number,
  bevel = 0,
): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 10,
  })
  // Plan plane (x=east, y=north) extruded along +z; rotate so extrusion
  // points up and north maps to world -z (Projection in geo.ts).
  geometry.rotateX(-Math.PI / 2)
  geometry.computeVertexNormals()
  return geometry
}

/** Extrude an elevation profile (x across, y=up) by wall thickness. */
export function extrudeThick(shape: Shape, depth: number): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 10,
  })
  geometry.computeVertexNormals()
  return geometry
}

/**
 * Ground-level arcade silhouette as a single outline: `bayCount` bays of
 * `bayWidth` between pier legs, each opening `archWidth` wide whose crown
 * sits `legHeight` up in an arcade band of total height `top`.
 */
export function arcadeOutline(
  bayCount: number,
  bayWidth: number,
  archWidth: number,
  legHeight: number,
  top: number,
): Shape {
  const half = (bayCount * bayWidth) / 2
  const shape = new Shape()
  shape.moveTo(-half, 0)
  shape.lineTo(-half, top)
  shape.lineTo(half, top)
  shape.lineTo(half, 0)
  for (let bay = bayCount - 1; bay >= 0; bay -= 1) {
    const cx = (bay + 0.5) * bayWidth - half
    shape.lineTo(cx + archWidth / 2, 0)
    shape.lineTo(cx + archWidth / 2, legHeight)
    shape.absarc(cx, legHeight, archWidth / 2, 0, Math.PI, false)
    shape.lineTo(cx - archWidth / 2, 0)
  }
  shape.closePath()
  return shape
}
