"""Parse Cardputer CSV logs into platform and segment measurements."""

from __future__ import annotations

import csv
import unicodedata
import re
from dataclasses import dataclass, field
from pathlib import Path


def slugify(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")


@dataclass
class PlatformMeasurement:
    station_id: str
    line: str
    depth_m: float
    measurement_ids: list[str] = field(default_factory=list)
    confidence_m: float | None = None


@dataclass
class SegmentProfile:
    line: str
    from_station: str
    to_station: str
    points: list[tuple[float, float]]
    measurement_ids: list[str] = field(default_factory=list)

    @property
    def segment_id(self) -> str:
        return f"{self.line}:{'-'.join(sorted((self.from_station, self.to_station)))}"


def read_log(path: Path) -> list[dict[str, str]]:
    with open(path, encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError("empty CSV")
        missing = {"record_type", "event", "line", "station", "depth_m"} - set(reader.fieldnames)
        if missing:
            raise ValueError(f"missing columns: {', '.join(sorted(missing))}")
        rows = [{key: (value or "").strip() for key, value in row.items()} for row in reader]
    _normalize_legacy_depths(rows)
    return rows


def _float(value: str) -> float | None:
    if value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _normalize_legacy_depths(rows: list[dict[str, str]]) -> None:
    depths = [
        depth
        for row in rows
        if row.get("event") in {"PLATFORM", "STATION_STOP"}
        and (depth := _float(row.get("depth_m", ""))) is not None
        and depth != 0
    ]
    if not depths:
        return
    negatives = sum(depth < 0 for depth in depths)
    if negatives * 2 <= len(depths):
        return
    for row in rows:
        depth = _float(row.get("depth_m", ""))
        if depth is not None and depth != 0:
            row["depth_m"] = str(-depth)


def _measurement_id(row: dict[str, str]) -> str:
    session = row.get("session_id", "")
    sequence = row.get("seq", "")
    return f"{session}:{sequence}" if session else sequence


def extract_platform_measurements(
    rows: list[dict[str, str]],
) -> dict[tuple[str, str], PlatformMeasurement]:
    measurements: dict[tuple[str, str], PlatformMeasurement] = {}
    for row in rows:
        if row.get("event") != "PLATFORM":
            continue
        line = row.get("line", "")
        station = row.get("station", "")
        depth = _float(row.get("depth_m", ""))
        if not line or not station or depth is None:
            continue
        station_id = slugify(station)
        key = (line, station_id)
        measurement = measurements.get(key)
        if measurement is None:
            measurements[key] = PlatformMeasurement(
                station_id=station_id,
                line=line,
                depth_m=depth,
                measurement_ids=[_measurement_id(row)],
                confidence_m=_float(row.get("confidence_m", "")),
            )
        else:
            measurement.depth_m = depth
            measurement.measurement_ids.append(_measurement_id(row))
    return measurements


def extract_segment_profiles(rows: list[dict[str, str]]) -> dict[str, SegmentProfile]:
    profiles: dict[str, SegmentProfile] = {}
    run: dict[str, object] | None = None
    stops: list[tuple[int, dict[str, str]]] = []
    samples: list[tuple[int, dict[str, str]]] = []

    def finish_run() -> None:
        nonlocal run, stops, samples
        if run is None:
            return
        line = str(run["line"])
        for index in range(len(stops) - 1):
            first_index, first = stops[index]
            second_index, second = stops[index + 1]
            between = [
                (sample_index, sample)
                for sample_index, sample in samples
                if first_index < sample_index < second_index
            ]
            depths = [
                (sample_index, depth)
                for sample_index, sample in between
                if (depth := _float(sample.get("depth_m", ""))) is not None
            ]
            if len(depths) < 2:
                continue
            from_station = slugify(first.get("station", ""))
            to_station = slugify(second.get("station", ""))
            if not from_station or not to_station:
                continue
            points = [
                (index / (len(depths) - 1), float(depth))
                for index, (_sample_index, depth) in enumerate(depths)
            ]
            start_depth = _float(first.get("depth_m", ""))
            end_depth = _float(second.get("depth_m", ""))
            if start_depth is not None:
                points[0] = (0.0, start_depth)
            if end_depth is not None:
                points[-1] = (1.0, end_depth)
            profile = SegmentProfile(
                line=line,
                from_station=from_station,
                to_station=to_station,
                points=points,
                measurement_ids=[
                    _measurement_id(first),
                    *[_measurement_id(sample) for _index, sample in between],
                    _measurement_id(second),
                ],
            )
            profiles[profile.segment_id] = profile
        run = None
        stops = []
        samples = []

    for index, row in enumerate(rows):
        event = row.get("event", "")
        record_type = row.get("record_type", "")
        if event == "RIDE_START":
            finish_run()
            run = {
                "line": row.get("line", ""),
                "direction": row.get("direction", ""),
            }
            stops = []
            samples = []
        elif event == "STATION_STOP" and run is not None:
            stops.append((index, row))
        elif record_type == "sample" and run is not None:
            samples.append((index, row))
        elif event == "RIDE_END":
            finish_run()
    finish_run()
    return profiles


def aggregate(rows: list[dict[str, str]]) -> tuple[
    dict[tuple[str, str], PlatformMeasurement], dict[str, SegmentProfile]
]:
    platforms = extract_platform_measurements(rows)
    profiles = extract_segment_profiles(rows)
    for profile in profiles.values():
        if not profile.points:
            continue
        start = platforms.get((profile.line, profile.from_station))
        end = platforms.get((profile.line, profile.to_station))
        if start is not None:
            profile.points[0] = (0.0, start.depth_m)
        if end is not None:
            profile.points[-1] = (1.0, end.depth_m)
    return platforms, profiles
