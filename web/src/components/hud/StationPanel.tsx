import type { Platform, Station } from '../../data/schemas'
import { SOURCE_LABELS } from '../../lib/provenance'

interface StationPanelProps {
  station: Station | null
  lines: Array<{ id: string; name: string; color: string }>
  onClose: () => void
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
  onClose,
}: StationPanelProps) {
  const lineById = new Map(lines.map((line) => [line.id, line]))

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
            — surface {station.surface_elevation_m.toFixed(1)} m
          </p>

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

          <CrossingSummary station={station} />
        </>
      ) : null}
    </aside>
  )
}
