import { useEffect, useMemo, useRef, useState } from 'react'
import type { Line, Station } from '../../data/schemas'
import { buildLineProfile } from '../../lib/lineProfile'
import { SOURCE_LABELS } from '../../lib/provenance'
import {
  formatInteger,
  formatSlope,
} from '../../lib/segmentMetrics'

interface LongSectionProps {
  lines: Line[]
  stations: Station[]
  lineId: string
  selectedSegmentId: string | null
  selectedStationId: string | null
  onSelectLine: (lineId: string) => void
  onSelectSegment: (segmentId: string) => void
  onSelectStation: (stationId: string) => void
  onClose: () => void
}

interface HoverInfo {
  kind: 'station' | 'segment'
  id: string
}

const HEIGHT = 158
const LEFT = 46
const RIGHT = 20
const TOP = 16
const BOTTOM = 38

function shortName(name: string): string {
  return name.length > 12 ? `${name.slice(0, 11)}…` : name
}

export function LongSection({
  lines,
  stations,
  lineId,
  selectedSegmentId,
  selectedStationId,
  onSelectLine,
  onSelectSegment,
  onSelectStation,
  onClose,
}: LongSectionProps) {
  const line = lines.find((candidate) => candidate.id === lineId) ?? lines[0]
  const stationById = useMemo(
    () => new Map(stations.map((station) => [station.id, station])),
    [stations],
  )
  const profile = useMemo(
    () => (line ? buildLineProfile(line, stationById) : null),
    [line, stationById],
  )
  const chartRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(900)
  const [hover, setHover] = useState<HoverInfo | null>(null)

  useEffect(() => {
    const element = chartRef.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setWidth(entry.contentRect.width)
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = chartRef.current
    if (!element || !profile || !profile.stations.length) {
      return
    }
    const selectedTarget = selectedSegmentId
      ? profile.segments.find(
          (segment) => segment.segmentId === selectedSegmentId,
        )?.startDistanceM
      : selectedStationId
        ? profile.stations.find(
            (station) => station.stationId === selectedStationId,
          )?.distanceM
        : null
    const target =
      selectedTarget ??
      profile.segments.find((segment) => segment.quality === 'measured')
        ?.startDistanceM
    if (target === undefined || target === null) {
      return
    }
    const first = profile.stations[0].distanceM
    const last = profile.stations[profile.stations.length - 1].distanceM
    const chartWidth = Math.max(width, 680)
    const targetX =
      LEFT +
      ((target - first) / Math.max(last - first, 1)) *
        (chartWidth - LEFT - RIGHT)
    element.scrollLeft = Math.max(0, targetX - element.clientWidth / 2)
  }, [profile, selectedSegmentId, selectedStationId, width])

  if (!line || !profile || !profile.stations.length) {
    return null
  }

  const drawWidth = Math.max(width, 680)
  const startDistance = profile.stations[0].distanceM
  const endDistance = profile.stations[profile.stations.length - 1].distanceM
  const span = Math.max(endDistance - startDistance, 1)
  const plotWidth = drawWidth - LEFT - RIGHT
  const plotHeight = HEIGHT - TOP - BOTTOM
  const verticalExaggeration =
    span > 0
      ? Math.max(
          (plotHeight / Math.max(profile.maxElevationM - profile.minElevationM, 1)) /
            (plotWidth / span),
          1,
        )
      : 1
  const yPad = Math.max(
    (profile.maxElevationM - profile.minElevationM) * 0.12,
    2,
  )
  const minElevation = profile.minElevationM - yPad
  const maxElevation = profile.maxElevationM + yPad
  const profileStationById = new Map(
    profile.stations.map((station) => [station.stationId, station]),
  )
  const segmentById = new Map(
    profile.segments.map((segment) => [segment.segmentId, segment]),
  )

  const x = (distanceM: number) =>
    LEFT + ((distanceM - startDistance) / span) * plotWidth
  const y = (elevationM: number) =>
    TOP +
    ((maxElevation - elevationM) /
      Math.max(maxElevation - minElevation, 1)) *
      plotHeight

  const ticks = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3
    return maxElevation - (maxElevation - minElevation) * ratio
  })
  const groundStations = profile.stations.filter(
    (station) => station.groundM !== null,
  )
  const groundPoints = groundStations
    .map((station) => `${x(station.distanceM)},${y(station.groundM!)}`)
    .join(' ')
  const groundArea = groundStations.length
    ? `M ${x(groundStations[0].distanceM)} ${TOP} L ${groundPoints
        .split(' ')
        .join(' L ')} L ${x(
        groundStations[groundStations.length - 1].distanceM,
      )} ${TOP} Z`
    : ''

  function readoutFor(info: HoverInfo | null): string {
    if (!info) {
      return selectedSegmentId
        ? readoutFor({ kind: 'segment', id: selectedSegmentId })
        : selectedStationId
          ? readoutFor({ kind: 'station', id: selectedStationId })
          : 'Select a station or tunnel'
    }
    if (info.kind === 'station') {
      const station = profileStationById.get(info.id)
      if (!station) {
        return 'Select a station or tunnel'
      }
      return station.depthM === null
        ? `${station.name} · depth unknown`
        : `${station.name} · ${station.depthM.toFixed(2)} m deep · ${SOURCE_LABELS[station.source]}`
    }
    const segment = segmentById.get(info.id)
    if (!segment) {
      return 'Select a station or tunnel'
    }
    const slope = formatSlope(segment)
    const detail = segment.hasBothEnds ? slope : 'depth unknown'
    return `${segment.from.name} → ${segment.to.name} · ${formatInteger(segment.lengthM)} m · ${detail}`
  }

  const selectedStation = selectedStationId
    ? profileStationById.get(selectedStationId)
    : null
  const selectedProfileSegment = selectedSegmentId
    ? segmentById.get(selectedSegmentId)
    : null
  const selectedBand = selectedProfileSegment
    ? (() => {
        const from = profileStationById.get(
          selectedProfileSegment.from.stationId,
        )
        const to = profileStationById.get(selectedProfileSegment.to.stationId)
        if (!from || !to) {
          return null
        }
        const bandX = Math.min(x(from.distanceM), x(to.distanceM))
        return {
          x: bandX,
          width: Math.abs(x(to.distanceM) - x(from.distanceM)),
        }
      })()
    : null

  return (
    <section className="panel long-section" aria-label="Line long section">
      <div className="long-section-head">
        <h2>Line {line.name} · long section</h2>
        <span className="hint">
          {profile.knownStations} of {profile.stations.length} stations known
        </span>
        <div className="long-section-lines">
          {lines.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={
                candidate.id === line.id
                  ? 'long-section-line active'
                  : 'long-section-line'
              }
              aria-pressed={candidate.id === line.id}
              aria-label={`Show long section for line ${candidate.name}`}
              onClick={() => onSelectLine(candidate.id)}
            >
              <span
                className="line-swatch"
                style={{ background: candidate.color }}
              />
              {candidate.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="long-section-close"
          aria-label="Close long section"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <p className="long-section-readout" aria-live="polite">
        {readoutFor(hover)}
      </p>

      <div className="long-section-chart" ref={chartRef}>
        <svg
          width={drawWidth}
          height={HEIGHT}
          role="group"
          aria-label={`Long section of line ${line.name}`}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((tick) => {
            const tickY = y(tick)
            return (
              <g key={tick}>
                <line
                  x1={LEFT}
                  y1={tickY}
                  x2={drawWidth - RIGHT}
                  y2={tickY}
                  className="long-section-grid"
                />
                <text
                  x={LEFT - 7}
                  y={tickY + 2.5}
                  textAnchor="end"
                  className="long-section-axis"
                >
                  {Math.round(tick)}
                </text>
              </g>
            )
          })}
          <text
            x={LEFT - 7}
            y={TOP - 5}
            textAnchor="end"
            className="long-section-axis"
          >
            m a.s.l.
          </text>

          {groundArea ? (
            <>
              <path d={groundArea} className="long-section-ground-fill" />
              <polyline
                points={groundPoints}
                className="long-section-ground"
              />
            </>
          ) : null}

          {selectedBand ? (
            <rect
              x={selectedBand.x}
              y={TOP}
              width={selectedBand.width}
              height={plotHeight}
              fill={line.color}
              opacity={0.055}
            />
          ) : null}

          {profile.segments.flatMap((segment) => {
            const from = profileStationById.get(segment.from.stationId)
            const to = profileStationById.get(segment.to.stationId)
            if (
              !from ||
              !to ||
              from.trackM === null ||
              to.trackM === null ||
              !segment.hasBothEnds
            ) {
              return []
            }
            const selected = segment.segmentId === selectedSegmentId
            const x1 = x(from.distanceM)
            const x2 = x(to.distanceM)
            const y1 = y(from.trackM)
            const y2 = y(to.trackM)
            return [
              <g key={segment.segmentId}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={line.color}
                  strokeWidth={selected ? 3.6 : 2}
                  strokeDasharray={
                    segment.profileQuality === 'interpolated'
                      ? '6 4'
                      : undefined
                  }
                  opacity={segment.quality === 'official' ? 0.72 : 1}
                  strokeLinecap="round"
                />
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="transparent"
                  strokeWidth={14}
                  tabIndex={0}
                  role="button"
                  aria-label={`Select tunnel ${segment.from.name} to ${segment.to.name}`}
                  style={{ cursor: 'pointer' }}
                  onPointerEnter={() =>
                    setHover({ kind: 'segment', id: segment.segmentId })
                  }
                  onFocus={() =>
                    setHover({ kind: 'segment', id: segment.segmentId })
                  }
                  onBlur={() => setHover(null)}
                  onClick={() => onSelectSegment(segment.segmentId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelectSegment(segment.segmentId)
                    }
                  }}
                />
              </g>,
            ]
          })}

          {profile.stations.map((station, index) => {
            const stationX = x(station.distanceM)
            const groundY =
              station.groundM === null ? null : y(station.groundM)
            const trackY =
              station.trackM === null ? null : y(station.trackM)
            const selected = station.stationId === selectedStation?.stationId
            return (
              <g key={station.stationId}>
                {groundY !== null && trackY !== null ? (
                  <line
                    x1={stationX}
                    y1={groundY}
                    x2={stationX}
                    y2={trackY}
                    stroke="var(--color-line-strong)"
                    strokeWidth={1}
                    opacity={0.7}
                  />
                ) : null}
                <circle
                  cx={stationX}
                  cy={trackY ?? groundY ?? TOP}
                  r={selected ? 4.6 : 2.8}
                  fill={
                    trackY === null ? 'var(--color-bg)' : line.color
                  }
                  stroke={line.color}
                  strokeWidth={1.2}
                  opacity={station.source === 'official' ? 0.55 : 1}
                />
                {selected ? (
                  <circle
                    cx={stationX}
                    cy={trackY ?? groundY ?? TOP}
                    r={8}
                    fill="none"
                    stroke={line.color}
                    strokeWidth={1}
                    opacity={0.5}
                  />
                ) : null}
                {station.depthM !== null ? (
                  <text
                    x={stationX}
                    y={(trackY ?? TOP) + 11}
                    textAnchor="middle"
                    className="long-section-depth"
                  >
                    {station.depthM.toFixed(1)} m
                  </text>
                ) : null}
                <text
                  x={stationX}
                  y={index % 2 === 0 ? HEIGHT - 9 : HEIGHT - 21}
                  textAnchor="middle"
                  className="long-section-label"
                >
                  {shortName(station.name)}
                </text>
                <rect
                  x={stationX - 13}
                  y={TOP}
                  width={26}
                  height={plotHeight}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`Select station ${station.name}`}
                  style={{ cursor: 'pointer' }}
                  onPointerEnter={() =>
                    setHover({ kind: 'station', id: station.stationId })
                  }
                  onFocus={() =>
                    setHover({ kind: 'station', id: station.stationId })
                  }
                  onBlur={() => setHover(null)}
                  onClick={() => onSelectStation(station.stationId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelectStation(station.stationId)
                    }
                  }}
                />
              </g>
            )
          })}

          <text
            x={drawWidth - RIGHT}
            y={TOP - 5}
            textAnchor="end"
            className="long-section-axis"
          >
            vert ×{Math.round(verticalExaggeration)}
          </text>
        </svg>
      </div>
    </section>
  )
}
