"""Fetch and cache the pinned OSM route geometry for the Lisbon Metro lines."""

from __future__ import annotations

from pathlib import Path

from osm import OSM_RELATION_IDS, ensure_osm


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    cache = ensure_osm(root / "data" / "raw")
    for line_id, relation_id in OSM_RELATION_IDS.items():
        path = cache / f"{line_id}-{relation_id}.xml"
        print(f"{line_id}: relation {relation_id} -> {path}")


if __name__ == "__main__":
    main()
