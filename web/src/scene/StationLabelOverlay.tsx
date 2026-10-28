import type { RefObject } from 'react'
import type { StationLabelVisual } from './stationVisuals'

interface StationLabelOverlayProps {
  labels: StationLabelVisual[]
  selectedLines: ReadonlySet<string>
  labelRefs: RefObject<Map<string, HTMLDivElement>>
}

export function StationLabelOverlay({
  labels,
  selectedLines,
  labelRefs,
}: StationLabelOverlayProps) {
  return (
    <div className="station-label-layer" aria-hidden="true">
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
          <div
            key={label.stationId}
            className={className}
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
              style={{ background: label.color }}
            />
            <span>{label.name}</span>
          </div>
        )
      })}
    </div>
  )
}
