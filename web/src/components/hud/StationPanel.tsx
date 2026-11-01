import type { Line, Platform, Station } from '../../data/schemas'
import { SOURCE_LABELS } from '../../lib/provenance'
import {
  formatInteger,
  getSegmentMetrics,
} from '../../lib/segmentMetrics'
import { StationSection } from './StationSection'

interface StationPanelProps {
  station: Station | null
  lines: Line[]
  stations: Station[]
  onClose: () => void
  onSelectSegment: (segmentId: string) => void
}

function GridRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
    </>
  )
}

function PlatformRow({
  platform,
  lineName,
  lineColor,
}: {
  platform: Platform
  lineName: string
  lineColor: string
}) {
  return (
    <div className="platform-row">
      <div className="platform-head">
        <span
          className="platform-swatch"
          style={{ background: lineColor }}
        />
        <span>{lineName}</span>
        <span className="platform-source">
          {SOURCE_LABELS[platform.depth_source]}
        </span>
      </div>

      <div className="platform-grid">
        <GridRow
          label="Depth"
          value={
            platform.platform_depth_m === null
              ? 'Unknown'
              : `${platform.platform_depth_m.toFixed(2)} m`
          }
        />
        <GridRow label="Basis" value={platform.depth_basis} />
        {platform.confidence_m !== null ? (
          <GridRow
            label="Confidence"
            value={`±${platform.confidence_m.toFixed(1)} m`}
          />
        ) : null}
        {platform.official_depth_m !== null &&
        platform.depth_source !== 'official' ? (
          <GridRow
            label="Official"
            value={`${platform.official_depth_m.toFixed(2)} m`}
          />
        ) : null}
        {platform.measured_depth_m !== null ? (
          <GridRow
            label="Measured"
            value={`${platform.measured_depth_m.toFixed(2)} m`}
          />
        ) : null}
      </div>

      {platform.note ? <p className="platform-note">{platform.note}</p> : null}
    </div>
  )
}

function CrossingSummary({ station }: { station: Station }) {
  if (station.platforms.length < 2) {
    return null
  }

  if (station.interchange?.kind === 'parallel') {
    const known = station.platforms.filter(
      (platform) => platform.platform_depth_m !== null,
    )
    const unknown = station.platforms.length - known.length
    const depth = known.length
      ? Math.max(...known.map((platform) => platform.platform_depth_m ?? 0))
      : null
    const depthText =
      unknown > 0
        ? 'Platform depths are not surveyed yet; no vertical crossing is assumed.'
        : depth !== null &&
            known.every(
              (platform) =>
                Math.abs((platform.platform_depth_m ?? 0) - depth) < 0.05,
            )
          ? `Both platforms share the ${depth.toFixed(2)} m station level.`
          : 'Platform depths differ; check the survey.'
    const structureText =
      station.structure === 'overground'
        ? 'The station is overground.'
        : station.structure === 'underground'
          ? 'The station is underground.'
          : null

    return (
      <div className="crossing-box">
        <h3>Cross-platform interchange</h3>
        <p>
          Lines {station.lines.join(' and ')} run side by side through this
          station, {station.interchange.spacing_m.toFixed(1)} m apart
          horizontally.
        </p>
        <p>{depthText}</p>
        {structureText ? <p>{structureText}</p> : null}
      </div>
    )
  }

  const known = station.platforms.filter(
    (platform) => platform.platform_depth_m !== null,
  )
  const unknown = station.platforms.filter(
    (platform) => platform.platform_depth_m === null,
  )

  if (unknown.length > 0) {
    const names = unknown.map((platform) => platform.line).join(', ')
    const label =
      unknown.length === 1
        ? `Platform ${names} has`
        : `Platforms ${names} have`

    return (
      <div className="crossing-box warning">
        <h3>Crossing unresolved</h3>
        <p>
          {label} no depth yet. The viewer will not draw a guessed
          crossing.
        </p>
      </div>
    )
  }

  if (known.length < 2) {
    return null
  }

  const deepest = known.reduce((best, platform) =>
    (platform.platform_depth_m ?? 0) > (best.platform_depth_m ?? 0)
      ? platform
      : best,
  )
  const shallowest = known.reduce((best, platform) =>
    (platform.platform_depth_m ?? 0) < (best.platform_depth_m ?? 0)
      ? platform
      : best,
  )
  const gap =
    (deepest.platform_depth_m ?? 0) -
    (shallowest.platform_depth_m ?? 0)
  const basis = known.every(
    (platform) => platform.depth_basis === 'station',
  )

  if (gap < 0.05) {
    return (
      <div className="crossing-box warning">
        <h3>Crossing check</h3>
        <p>
          {basis
            ? 'Both lines use the same station-level depth. Platform separation is unknown, not zero.'
            : 'Platform depths are equal. Check the survey if the lines should be separated.'}
        </p>
      </div>
    )
  }

  return (
    <div className="crossing-box">
      <h3>Crossing check</h3>
      <p>
        Line {deepest.line} is {gap.toFixed(2)} m below line{' '}
        {shallowest.line} at this station.
      </p>
    </div>
  )
}

export function StationPanel({
  station,
  lines,
  stations,
  onClose,
  onSelectSegment,
}: StationPanelProps) {
  const lineById = new Map(lines.map((line) => [line.id, line]))
  const lineColors = new Map(lines.map((line) => [line.id, line.color]))
  const lineNames = new Map(lines.map((line) => [line.id, line.name]))
  const stationById = new Map(
    stations.map((candidate) => [candidate.id, candidate]),
  )
  const tunnels = station
    ? lines.flatMap((line) =>
        line.segments
          .filter(
            (segment) =>
              segment.from === station.id || segment.to === station.id,
          )
          .map((segment) => ({
            line,
            metrics: getSegmentMetrics(line.id, segment, stationById),
          })),
      )
    : []

  return (
    <aside
      id="station-panel"
      className="panel station-panel"
      hidden={!station}
      aria-live="polite"
    >
      {station ? (
        <>
          <button
            id="station-close"
            className="panel-close"
            type="button"
            aria-label="Close station panel"
            onClick={onClose}
          >
            Close
          </button>

          <p className="station-kicker">
            {station.platforms.length > 1 ? 'Interchange' : 'Station'}
          </p>
          <h2 className="station-title">{station.name}</h2>
          <p className="station-sub">
            {station.lines
              .map((lineId) => lineById.get(lineId)?.name ?? lineId)
              .join(' · ')}{' '}
            — surface {station.ground_elevation_m.toFixed(1)} m (DEM)
          </p>

          <StationSection
            platforms={station.platforms}
            lineColors={lineColors}
            lineNames={lineNames}
          />

          <CrossingSummary station={station} />

          {tunnels.length ? (
            <div className="tunnel-list">
              <div className="tunnel-heading">
                <h3>Tunnels from here</h3>
                <span className="hint">select</span>
              </div>
              {tunnels.map(({ line, metrics }) => {
                const isFrom = metrics.from.stationId === station.id
                const thisEnd = isFrom ? metrics.from : metrics.to
                const otherEnd = isFrom ? metrics.to : metrics.from
                return (
                  <button
                    key={metrics.segmentId}
                    type="button"
                    className="tunnel-row"
                    onClick={() => onSelectSegment(metrics.segmentId)}
                  >
                    <span
                      className="line-swatch"
                      style={{ background: line.color }}
                    />
                    <span className="tunnel-main">
                      <span className="tunnel-name">{otherEnd.name}</span>
                      <span className="tunnel-meta">
                        {formatDepthValue(thisEnd.depthM)} →{' '}
                        {formatDepthValue(otherEnd.depthM)} ·{' '}
                        {SOURCE_LABELS[metrics.quality]}
                      </span>
                    </span>
                    <span className="tunnel-length">
                      {formatInteger(metrics.lengthM)} m
                    </span>
                  </button>
                )
              })}
            </div>
          ) : null}

          <div className="platform-list">
            {station.platforms.map((platform, index) => (
              <PlatformRow
                key={`${platform.line}:${index}`}
                platform={platform}
                lineName={
                  lineById.get(platform.line)?.name ?? platform.line
                }
                lineColor={
                  lineById.get(platform.line)?.color ?? '#999999'
                }
              />
            ))}
          </div>

        </>
      ) : null}
    </aside>
  )
}

function formatDepthValue(value: number | null): string {
  return value === null ? 'unknown' : `${value.toFixed(2)} m`
}
