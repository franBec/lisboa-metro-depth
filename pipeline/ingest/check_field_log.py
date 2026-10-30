"""Summarize a Cardputer field CSV against the downstream parser contract."""

from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from read_log import aggregate, read_log  # noqa: E402


def format_float(value: float | None) -> str:
    if value is None:
        return "--"
    return f"{value:.2f}"


def summarize(path: Path) -> int:
    rows = read_log(path)
    sessions = Counter(row.get("session_id", "") for row in rows)
    events = Counter(row.get("event", "") for row in rows if row.get("event"))
    modes = Counter(row.get("mode", "") for row in rows if row.get("mode"))
    platforms, profiles = aggregate(rows)

    print(f"log: {path}")
    print(f"rows: {len(rows)}")
    print(f"sessions: {dict(sessions)}")
    print(f"events: {dict(events)}")
    print(f"modes: {dict(modes)}")
    print()
    if not platforms:
        print("platforms: none")
    else:
        print("platforms:")
        for (line, station), measurement in sorted(platforms.items()):
            ids = ",".join(measurement.measurement_ids)
            print(
                f"  {line}/{station}: depth {format_float(measurement.depth_m)} m"
                f" [{ids}]"
            )
    print()
    if not profiles:
        print("segments: none")
    else:
        print("segments:")
        for segment_id, profile in sorted(profiles.items()):
            points = len(profile.points)
            print(
                f"  {segment_id}: {points} points, {profile.from_station}"
                f" -> {profile.to_station} [{','.join(profile.measurement_ids[:4])}...]"
            )
    print()
    print("parser-check summary:")
    print(f"  SURFACE={events.get('SURFACE', 0)}")
    print(f"  PLATFORM={events.get('PLATFORM', 0)}")
    print(f"  RIDE_START={events.get('RIDE_START', 0)}")
    print(f"  RIDE_END={events.get('RIDE_END', 0)}")
    print(f"  STATION_STOP={events.get('STATION_STOP', 0)}")
    print(f"  NOTE={events.get('NOTE', 0)}")
    print(f"  SESSION_START={events.get('SESSION_START', 0)}")
    print(f"  SESSION_END={events.get('SESSION_END', 0)}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("log", type=Path, help="Cardputer CSV log")
    parser.add_argument(
        "--merge-target",
        type=Path,
        default=None,
        help=(
            "OPTIONAL data directory (usually a TEMP copy under /tmp)"
            " to run merge.py against; the target directory must already be a copy"
        ),
    )
    args = parser.parse_args()
    summarize(args.log)
    if args.merge_target is not None:
        from merge import merge_data

        result = merge_data(args.merge_target, args.log)
        print()
        print(f"merged into {args.merge_target}:")
        print(f"  platform_records: {result['platform_records']}")
        print(f"  segment_records: {result['segment_records']}")
        print(f"  provenance: {result['provenance_counts']}")
    return 0


if __name__ == "__main__":
    main()
