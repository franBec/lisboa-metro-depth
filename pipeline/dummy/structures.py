"""Load the curated station structure map.

Most Lisbon Metro platforms are underground. Three are not: Campo Grande on
both lines sits on a viaduct, Senhor Roubado is an elevated station, and
Odivelas has its platforms at street level between an upper and a lower atrium.
The surveyed depth of those platforms is negative or near zero, so the pipeline
needs to know about them before it interprets a measurement.

Source of record: the `posição` field of the Portuguese Wikipedia station
infoboxes, cross-checked against OSM `layer`/`bridge` tags on the track ways.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

STRUCTURES = ("underground", "overground", "at-grade", "unknown")


@dataclass(frozen=True)
class StationStructure:
    station_id: str
    line_id: str
    structure: str
    height_above_street_m: float | None
    source: str
    note: str


def load_station_structures(path: Path) -> dict[str, str]:
    """Return station_id -> structure, enforcing one structure per station."""
    with open(path, encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))

    seen: dict[str, set[str]] = {}
    for row in rows:
        station_id = row["station_id"].strip()
        structure = row["structure"].strip()
        if structure not in STRUCTURES:
            raise ValueError(f"{station_id}: unknown structure {structure!r}")
        seen.setdefault(station_id, set()).add(structure)

    result: dict[str, str] = {}
    for station_id, values in seen.items():
        if len(values) != 1:
            raise ValueError(
                f"{station_id}: conflicting structures {sorted(values)}"
            )
        result[station_id] = values.pop()
    return result
