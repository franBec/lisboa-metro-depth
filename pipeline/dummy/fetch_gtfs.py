"""Fetch and cache the pinned Lisbon Metro GTFS feed."""

from __future__ import annotations

from pathlib import Path

from gtfs import GTFS_URL, ensure_gtfs


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    path = ensure_gtfs(root / "data" / "raw")
    digest = (path.parent / (path.name + ".sha256")).read_text(encoding="utf-8").strip()
    print(f"GTFS: {path}")
    print(f"URL: {GTFS_URL}")
    print(f"SHA-256: {digest}")


if __name__ == "__main__":
    main()
