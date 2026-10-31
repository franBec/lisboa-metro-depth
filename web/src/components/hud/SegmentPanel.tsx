import type { Line } from '../../data/schemas'
import { SOURCE_LABELS } from '../../lib/provenance'
import {
  formatDepth,
  formatInteger,
  formatSlope,
  formatTrack,
  type SegmentMetrics,
} from '../../lib/segmentMetrics'
import { SectionDiagram } from './SectionDiagram'

interface SegmentPanelProps {
  metrics: SegmentMetrics | null
  line: Line | null
  onClose: () => void
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
    </>
  )
}

function shapeNote(metrics: SegmentMetrics): string {
  if (metrics.profileQuality === 'endpoints') {
    return 'Straight line between measured platforms. The tunnel shape between them is not surveyed.'
  }
  if (metrics.profileQuality === 'interpolated') {
    return 'Interpolated between station anchors. Not surveyed.'
  }
  return 'Depth unknown at one or both ends. No underground geometry is drawn.'
}

export function SegmentPanel({ metrics, line, onClose }: SegmentPanelProps) {
  return (
    <aside
      id="segment-panel"
      className="panel station-panel segment-panel"
      hidden={!metrics}
      aria-live="polite"
    >
      {metrics ? (
        <>
          <button
            id="segment-close"
            className="panel-close"
            type="button"
            aria-label="Close tunnel panel"
            onClick={onClose}
          >
            Close
          </button>

          <p className="station-kicker">
            Tunnel · Line {line?.name ?? metrics.lineId} ·{' '}
            {SOURCE_LABELS[metrics.quality]}
          </p>
          <h2 className="station-title">
            {metrics.from.name} <span className="segment-arrow">→</span>{' '}
            {metrics.to.name}
          </h2>

          <p className="segment-length">
            {formatInteger(metrics.lengthM)}{' '}
            <span className="segment-unit">m along track</span>
          </p>

          <SectionDiagram
            metrics={metrics}
            color={line?.color ?? '#999999'}
          />

          <div className="platform-grid segment-grid">
            <Row
              label={`${metrics.from.name} depth`}
              value={formatDepth(metrics.from.depthM)}
            />
            <Row
              label={`${metrics.to.name} depth`}
              value={formatDepth(metrics.to.depthM)}
            />
            {metrics.hasBothEnds ? (
              <>
                <Row
                  label="Track level"
                  value={`${formatTrack(metrics.from.trackM)} → ${formatTrack(metrics.to.trackM)}`}
                />
                <Row label="Average slope" value={formatSlope(metrics)} />
                <Row
                  label="Basis"
                  value={
                    metrics.quality === 'measured'
                      ? 'Measured platform depths'
                      : metrics.quality === 'official'
                        ? 'Official station depths'
                        : 'Interpolated station anchors'
                  }
                />
              </>
            ) : null}
          </div>

          <p className="platform-note">{shapeNote(metrics)}</p>
          {metrics.hasBothEnds ? (
            <p className="platform-note segment-source-note">
              Surface from Copernicus DEM at the station coordinate. Track
              levels are above sea level. The 3D terrain is illustrative.
            </p>
          ) : null}
        </>
      ) : null}
    </aside>
  )
}
