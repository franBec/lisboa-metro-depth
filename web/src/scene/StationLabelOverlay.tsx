import type { RefObject } from 'react'
import type { StationLabelVisual } from './stationVisuals'

interface StationLabelOverlayProps {
  labels: StationLabelVisual[]
  selectedLines: ReadonlySet<string>
  labelRefs: RefObject<Map<string, HTMLButtonElement>>
  onSelectStation: (stationId: string) => void
}

function dotBackground(colors: string[]): string {
  if (colors.length <= 1) {
    return colors[0] ?? '#999999'
  }

  const slice = 100 / colors.length
  const stops = colors.map(
    (color, index) =>
      `${color} ${index * slice}% ${(index + 1) * slice}%`,
  )

  return `linear-gradient(90deg, ${stops.join(', ')})`
}

export function StationLabelOverlay({
  labels,
  selectedLines,
  labelRefs,
  onSelectStation,
}: StationLabelOverlayProps) {
  return (
    <div className="station-label-layer">
      {labels.map((label) => {
        const active =
          selectedLines.size === 0 ||
          label.lineIds.some((lineId) => selectedLines.has(lineId))
        const className = [
          'station-label',
          label.interchange ? 'interchange' : '',
          active ? '' : 'dimmed',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <button
            key={label.stationId}
            type="button"
            className={className}
            aria-label={`Open ${label.name} station`}
            title={`${label.name} · ${label.depthSummary}`}
            onClick={() => onSelectStation(label.stationId)}
            ref={(element) => {
              if (element) {
                labelRefs.current.set(label.stationId, element)
              } else {
                labelRefs.current.delete(label.stationId)
              }
            }}
          >
            <span
              className="station-dot"
              style={{ background: dotBackground(label.colors) }}
            />
            <span>{label.name}</span>
          </button>
        )
      })}
    </div>
  )
}
