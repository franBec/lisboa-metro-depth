"""Fetch station surface elevations once from the Open-Meteo elevation API.

The resulting CSV is committed. The dummy build never calls the network.
"""

from __future__ import annotations

import csv
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from gtfs import Gtfs, ensure_gtfs

API = "https://api.open-meteo.com/v1/elevation"


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    output = root / "pipeline" / "curated" / "station_elevations.csv"
    gtfs = Gtfs(ensure_gtfs(root / "data" / "raw"))
    lines = gtfs.select_canonical()

    stations: dict[str, dict[str, object]] = {}
    for line in lines:
        for station in line["stations"]:
            station_id = str(station["slug"])
            stations.setdefault(
                station_id,
                {
                    "station_id": station_id,
                    "gtfs_name": station["name"],
                    "lat": station["lat"],
                    "lon": station["lon"],
                },
            )

    ordered = sorted(stations.values(), key=lambda item: str(item["station_id"]))
    latitudes = ",".join(f"{float(item['lat']):.6f}" for item in ordered)
    longitudes = ",".join(f"{float(item['lon']):.6f}" for item in ordered)
    query = urllib.parse.urlencode({"latitude": latitudes, "longitude": longitudes})
    request = urllib.request.Request(
        f"{API}?{query}",
        headers={"User-Agent": "lisboa-metro-depth/0.1 (+local research build)"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8"))

    elevations = payload.get("elevation")
    if not isinstance(elevations, list) or len(elevations) != len(ordered):
        raise RuntimeError(f"unexpected elevation response: {payload!r}")

    fetched_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    output.parent.mkdir(parents=True, exist_ok=True)
    with open(output, "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(
            [
                "station_id",
                "gtfs_name",
                "lat",
                "lon",
                "elevation_m",
                "source",
                "fetched_at",
            ]
        )
        for station, elevation in zip(ordered, elevations, strict=True):
            writer.writerow(
                [
                    station["station_id"],
                    station["gtfs_name"],
                    f"{float(station['lat']):.6f}",
                    f"{float(station['lon']):.6f}",
                    f"{float(elevation):.1f}",
                    "Open-Meteo Elevation API (Copernicus DEM)",
                    fetched_at,
                ]
            )
    print(f"wrote {output} ({len(ordered)} stations)")


if __name__ == "__main__":
    main()
