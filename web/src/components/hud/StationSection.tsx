import type { Platform } from '../../data/schemas'

interface StationSectionProps {
  platforms: Platform[]
  lineColors: ReadonlyMap<string, string>
  lineNames: ReadonlyMap<string, string>
}

const WIDTH = 320
const HEIGHT = 108
const LEFT = 18
const RIGHT = 18
const TOP = 18
const BOTTOM = 26

export function StationSection({
  platforms,
  lineColors,
  lineNames,
}: StationSectionProps) {
  const knownDepths = platforms
    .map((platform) => platform.platform_depth_m)
    .filter((depth): depth is number => depth !== null)
  const maxDepth = Math.max(...knownDepths, 1)
  const plotHeight = HEIGHT - TOP - BOTTOM
  const available = WIDTH - LEFT - RIGHT
  const step = available / Math.max(platforms.length, 1)

  const desc = platforms
    .map((platform) => {
      const name = lineNames.get(platform.line) ?? platform.line
      return platform.platform_depth_m === null
        ? `${name}: depth unknown`
        : `${name}: ${platform.platform_depth_m.toFixed(2)} metres deep`
    })
    .join('. ')

  return (
    <svg
      className="station-section"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={desc}
    >
      <title>Platform depths</title>
      <desc>{desc}</desc>
      <line
        x1={LEFT}
        y1={TOP}
        x2={WIDTH - RIGHT}
        y2={TOP}
        stroke="var(--color-line-strong)"
        strokeWidth={1}
      />
      <text x={LEFT} y={TOP - 6} className="section-diagram-caption">
        surface
      </text>

      {platforms.map((platform, index) => {
        const x = LEFT + step * (index + 0.5)
        const depth = platform.platform_depth_m
        const trackY =
          depth === null ? TOP : TOP + (depth / maxDepth) * plotHeight
        const color = lineColors.get(platform.line) ?? '#999999'

        return (
          <g key={`${platform.line}:${index}`}>
            {depth !== null ? (
              <line
                x1={x}
                y1={TOP}
                x2={x}
                y2={trackY}
                stroke={color}
                strokeWidth={1.3}
                opacity={0.7}
              />
            ) : null}
            <circle
              cx={x}
              cy={trackY}
              r={3.2}
              fill={depth === null ? 'var(--color-bg)' : color}
              stroke={color}
              strokeWidth={1.2}
            />
            <text
              x={x}
              y={trackY + 14}
              textAnchor="middle"
              className="section-diagram-depth"
            >
              {depth === null ? '—' : `${depth.toFixed(1)} m`}
            </text>
            <text
              x={x}
              y={HEIGHT - 2}
              textAnchor="middle"
              className="section-diagram-caption"
            >
              {lineNames.get(platform.line) ?? platform.line}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
