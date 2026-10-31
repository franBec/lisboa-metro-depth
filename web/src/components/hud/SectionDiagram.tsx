import type { SegmentMetrics } from '../../lib/segmentMetrics'
import { formatInteger } from '../../lib/segmentMetrics'

interface SectionDiagramProps {
  metrics: SegmentMetrics
  color: string
}

const WIDTH = 320
const HEIGHT = 132
const LEFT = 26
const RIGHT = 18
const TOP = 20
const BOTTOM = 30

export function SectionDiagram({ metrics, color }: SectionDiagramProps) {
  const values = [
    metrics.from.groundM,
    metrics.to.groundM,
    metrics.from.trackM,
    metrics.to.trackM,
  ].filter((value): value is number => value !== null)

  const rawMin = values.length ? Math.min(...values) : 0
  const rawMax = values.length ? Math.max(...values) : 1
  const padding = Math.max((rawMax - rawMin) * 0.08, 1)
  const min = rawMin - padding
  const max = rawMax + padding
  const plotHeight = HEIGHT - TOP - BOTTOM
  const x0 = LEFT
  const x1 = WIDTH - RIGHT

  const y = (elevation: number) =>
    TOP + ((max - elevation) / Math.max(max - min, 1)) * plotHeight

  const fromGroundY =
    metrics.from.groundM === null ? null : y(metrics.from.groundM)
  const toGroundY =
    metrics.to.groundM === null ? null : y(metrics.to.groundM)
  const fromTrackY =
    metrics.from.trackM === null ? null : y(metrics.from.trackM)
  const toTrackY =
    metrics.to.trackM === null ? null : y(metrics.to.trackM)

  const groundPath =
    fromGroundY !== null && toGroundY !== null ? (
      <>
        <path
          d={`M ${x0} ${TOP} L ${x0} ${fromGroundY} L ${x1} ${toGroundY} L ${x1} ${TOP} Z`}
          fill="rgba(233, 229, 218, 0.035)"
        />
        <line
          x1={x0}
          y1={fromGroundY}
          x2={x1}
          y2={toGroundY}
          stroke="var(--color-line-strong)"
          strokeWidth={1}
        />
      </>
    ) : null

  const shaftDash =
    metrics.quality === 'estimated' ? '3 3' : undefined
  const tunnelDash =
    metrics.profileQuality === 'interpolated' ? '6 4' : undefined
  const horizontalScale =
    metrics.lengthM > 0 ? (WIDTH - LEFT - RIGHT) / metrics.lengthM : 1
  const verticalScale =
    (HEIGHT - TOP - BOTTOM) / Math.max(max - min, 1)
  const exaggeration =
    horizontalScale > 0 ? Math.max(verticalScale / horizontalScale, 1) : 1

  const desc = `${metrics.from.name} to ${metrics.to.name}, ${formatInteger(metrics.lengthM)} metres. Depth at ${metrics.from.name}: ${metrics.from.depthM === null ? 'unknown' : `${metrics.from.depthM.toFixed(2)} metres`}. Depth at ${metrics.to.name}: ${metrics.to.depthM === null ? 'unknown' : `${metrics.to.depthM.toFixed(2)} metres`}.`

  return (
    <svg
      className="section-diagram"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={desc}
    >
      <title>{`${metrics.from.name} to ${metrics.to.name}`}</title>
      <desc>{desc}</desc>
      {groundPath}

      <text x={x0} y={TOP - 7} className="section-diagram-caption">
        surface
      </text>

      {fromGroundY !== null ? (
        <line
          x1={x0}
          y1={fromGroundY}
          x2={x0}
          y2={fromTrackY ?? fromGroundY}
          stroke={color}
          strokeWidth={1.3}
          strokeDasharray={metrics.from.depthM === null ? '3 3' : shaftDash}
          opacity={0.7}
        />
      ) : null}
      {toGroundY !== null ? (
        <line
          x1={x1}
          y1={toGroundY}
          x2={x1}
          y2={toTrackY ?? toGroundY}
          stroke={color}
          strokeWidth={1.3}
          strokeDasharray={metrics.to.depthM === null ? '3 3' : shaftDash}
          opacity={0.7}
        />
      ) : null}

      {fromTrackY !== null && toTrackY !== null ? (
        <line
          x1={x0}
          y1={fromTrackY}
          x2={x1}
          y2={toTrackY}
          stroke={color}
          strokeWidth={2.4}
          strokeDasharray={tunnelDash}
          opacity={metrics.quality === 'official' ? 0.72 : 1}
        />
      ) : null}

      {fromGroundY !== null ? (
        <circle
          cx={x0}
          cy={fromTrackY ?? fromGroundY}
          r={3.2}
          fill={fromTrackY === null ? 'var(--color-bg)' : color}
          stroke={color}
          strokeWidth={1.2}
        />
      ) : null}
      {toGroundY !== null ? (
        <circle
          cx={x1}
          cy={toTrackY ?? toGroundY}
          r={3.2}
          fill={toTrackY === null ? 'var(--color-bg)' : color}
          stroke={color}
          strokeWidth={1.2}
        />
      ) : null}

      <text
        x={x0 + 5}
        y={Math.min((fromTrackY ?? fromGroundY ?? TOP) + 13, HEIGHT - 20)}
        className="section-diagram-depth"
        textAnchor="start"
      >
        {metrics.from.depthM === null
          ? 'unknown'
          : `${metrics.from.depthM.toFixed(2)} m`}
      </text>
      <text
        x={x1 - 5}
        y={Math.min((toTrackY ?? toGroundY ?? TOP) + 13, HEIGHT - 20)}
        className="section-diagram-depth"
        textAnchor="end"
      >
        {metrics.to.depthM === null
          ? 'unknown'
          : `${metrics.to.depthM.toFixed(2)} m`}
      </text>

      <g className="section-diagram-dimension">
        <line x1={x0} y1={HEIGHT - 12} x2={x1} y2={HEIGHT - 12} />
        <line x1={x0} y1={HEIGHT - 16} x2={x0} y2={HEIGHT - 8} />
        <line x1={x1} y1={HEIGHT - 16} x2={x1} y2={HEIGHT - 8} />
        <text x={(x0 + x1) / 2} y={HEIGHT - 2} textAnchor="middle">
          {formatInteger(metrics.lengthM)} m
        </text>
      </g>

      {metrics.hasBothEnds ? (
        <text
          x={x1}
          y={TOP - 7}
          className="section-diagram-caption"
          textAnchor="end"
        >
          vert ×{Math.round(exaggeration)}
        </text>
      ) : null}
    </svg>
  )
}
