import { Link } from 'react-router'
import { useMemo, type CSSProperties } from 'react'
import type { Line, Manifest, Station } from '../../data/schemas'
import {
  SOURCE_COLORS,
  SOURCE_LABELS,
  SOURCE_ORDER,
} from '../../lib/provenance'
import { getSegmentMetrics } from '../../lib/segmentMetrics'
import { useViewerStore } from '../../state/viewerStore'
import { LongSection } from './LongSection'
import { SegmentPanel } from './SegmentPanel'
import { StationPanel } from './StationPanel'

const SCALES = [1, 10, 20]

interface ViewerHudProps {
  manifest: Manifest
  lines: Line[]
  stations: Station[]
  selectedLines: ReadonlySet<string>
  selectedStation: Station | null
  selectedSegmentId: string | null
  sectionOpen: boolean
  sectionLineId: string
  xray: boolean
  onToggleLine: (lineId: string) => void
  onSelectStation: (stationId: string) => void
  onSelectSegment: (segmentId: string) => void
  onCloseStation: () => void
  onCloseSegment: () => void
  onToggleSection: (enabled: boolean) => void
  onSelectSectionLine: (lineId: string) => void
  onXRayToggle: (enabled: boolean) => void
}

export function ViewerHud({
  manifest,
  lines,
  stations,
  selectedLines,
  selectedStation,
  selectedSegmentId,
  sectionOpen,
  sectionLineId,
  xray,
  onToggleLine,
  onSelectStation,
  onSelectSegment,
  onCloseStation,
  onCloseSegment,
  onToggleSection,
  onSelectSectionLine,
  onXRayToggle,
}: ViewerHudProps) {
  const labelsVisible = useViewerStore((state) => state.labelsVisible)
  const inferredVisible = useViewerStore((state) => state.inferredVisible)
  const verticalScale = useViewerStore((state) => state.verticalScale)
  const setLabelsVisible = useViewerStore((state) => state.setLabelsVisible)
  const setInferredVisible = useViewerStore(
    (state) => state.setInferredVisible,
  )
  const setVerticalScale = useViewerStore((state) => state.setVerticalScale)

  const stationById = useMemo(
    () => new Map(stations.map((station) => [station.id, station])),
    [stations],
  )
  const selectedSegment = useMemo(() => {
    if (!selectedSegmentId) {
      return null
    }
    for (const line of lines) {
      const segment = line.segments.find(
        (candidate) => candidate.id === selectedSegmentId,
      )
      if (segment) {
        return {
          line,
          metrics: getSegmentMetrics(line.id, segment, stationById),
        }
      }
    }
    return null
  }, [lines, selectedSegmentId, stationById])

  const demoText = manifest.capabilities.measured_depths
    ? 'Demo terrain · measured overlay'
    : 'Demo terrain · official depths'

  return (
    <div id="hud">
      <header className="brand">
        <Link className="brand-mark" to="/">
          Underground Atlas
        </Link>
        <h1>
          Lisboa <span>Metro depth</span>
        </h1>
      </header>

      <div className="top-status">
        {manifest.demo ? (
          <div id="demo-badge" className="demo-badge">
            <span className="demo-dot" />
            <span id="demo-text">{demoText}</span>
          </div>
        ) : null}
        <div className="scale-readout">
          Vertical scale <strong id="scale-value">x{verticalScale}</strong>
        </div>
      </div>

      <aside className="panel controls" aria-label="Viewer controls">
        <div className="panel-head">
          <h2>Network</h2>
          <span className="hint">click to isolate</span>
        </div>
        <div id="line-picker" className="line-picker">
          {lines.map((line) => {
            const selected = selectedLines.has(line.id)
            const active = selectedLines.size === 0 || selected
            const className = [
              'line-button',
              selected ? 'selected' : '',
              active ? '' : 'dimmed',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <button
                key={line.id}
                type="button"
                className={className}
                aria-pressed={selected}
                onClick={() => onToggleLine(line.id)}
              >
                <span
                  className="line-swatch"
                  style={{ background: line.color }}
                />
                <span className="line-name">{line.name}</span>
                <span className="line-count">
                  {line.segments.length} seg
                </span>
              </button>
            )
          })}
        </div>

        <div className="divider" />

        <div className="toggle-list">
          <label className="toggle">
            <input
              type="checkbox"
              checked={labelsVisible}
              onChange={(event) =>
                setLabelsVisible(event.target.checked)
              }
            />
            <span>Station labels</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={xray}
              onChange={(event) => onXRayToggle(event.target.checked)}
            />
            <span>X-ray terrain</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={sectionOpen}
              onChange={(event) =>
                onToggleSection(event.target.checked)
              }
            />
            <span>Long section</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={inferredVisible}
              onChange={(event) =>
                setInferredVisible(event.target.checked)
              }
            />
            <span>Show estimated and unknown</span>
          </label>
        </div>

        <div className="divider" />

        <div className="scale-control">
          <span className="hint">Vertical exaggeration</span>
          <div id="scale-buttons" className="scale-buttons">
            {SCALES.map((scale) => (
              <button
                key={scale}
                type="button"
                className={verticalScale === scale ? 'active' : ''}
                aria-pressed={verticalScale === scale}
                onClick={() => setVerticalScale(scale)}
              >
                {scale}x
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="panel legend" aria-label="Depth provenance legend">
        <div className="panel-head">
          <h2>Provenance</h2>
          <span id="dataset-version" className="hint">
            {manifest.dataset_version}
          </span>
        </div>
        <div id="legend-items" className="legend-items">
          {SOURCE_ORDER.map((source) => {
            const className = [
              'legend-line',
              source === 'estimated' ? 'dashed' : '',
              source === 'unknown' ? 'dotted' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <div key={source} className="legend-row">
                <span
                  className={className}
                  style={
                    {
                      '--c': SOURCE_COLORS[source],
                    } as CSSProperties
                  }
                />
                <span>{SOURCE_LABELS[source]}</span>
                <em>
                  {manifest.provenance_counts.platforms[source] ?? 0} st ·{' '}
                  {manifest.provenance_counts.segments[source] ?? 0} seg
                </em>
              </div>
            )
          })}
        </div>
        <p id="demo-note" className="legend-note">
          {manifest.demo_note}
        </p>
      </div>

      <StationPanel
        station={selectedSegment ? null : selectedStation}
        lines={lines}
        stations={stations}
        onClose={onCloseStation}
        onSelectSegment={onSelectSegment}
      />

      <SegmentPanel
        metrics={selectedSegment?.metrics ?? null}
        line={selectedSegment?.line ?? null}
        onClose={onCloseSegment}
      />

      {sectionOpen ? (
        <LongSection
          lines={lines}
          stations={stations}
          lineId={sectionLineId}
          selectedSegmentId={selectedSegmentId}
          selectedStationId={selectedStation?.id ?? null}
          onSelectLine={onSelectSectionLine}
          onSelectSegment={onSelectSegment}
          onSelectStation={onSelectStation}
          onClose={() => onToggleSection(false)}
        />
      ) : null}

      <footer id="credits" className="credits">
        <span id="attribution">
          {manifest.attribution.map((entry) => entry.name).join(' / ')}
        </span>
        <span className="credits-sep">/</span>
        <Link to="/maps/lisboa/method">Method</Link>
        <span className="credits-sep">/</span>
        <Link to="/">All maps</Link>
      </footer>
    </div>
  )
}
