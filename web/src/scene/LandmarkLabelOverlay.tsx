import type { RefObject } from 'react'
import type { LandmarkLabelVisual } from '../scene/landmarkVisuals'

interface LandmarkLabelOverlayProps {
  labels: LandmarkLabelVisual[]
  labelRefs: RefObject<Map<string, HTMLButtonElement>>
}

export function LandmarkLabelOverlay({
  labels,
  labelRefs,
}: LandmarkLabelOverlayProps) {
  return (
    <div className="landmark-label-layer" aria-hidden="true">
      {labels.map((label) => (
        <button
          key={label.id}
          type="button"
          tabIndex={-1}
          className={`landmark-label kind-${label.kind}`}
          title={label.name}
          ref={(element) => {
            if (element) {
              labelRefs.current.set(label.id, element)
            } else {
              labelRefs.current.delete(label.id)
            }
          }}
        >
          {label.kind === 'landmark' ? <span className="landmark-glyph" /> : null}
          <span>{label.name}</span>
        </button>
      ))}
    </div>
  )
}
