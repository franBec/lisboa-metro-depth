"""Build the local demo assets from GTFS, curated depths, and synthetic terrain."""

from __future__ import annotations

import csv
import json
import math
from datetime import datetime, timezone
from pathlib import Path

from gtfs import Gtfs, ensure_gtfs, shape_slice, slugify
from interchanges import deform_shape_for_interchange, load_interchanges
from osm import fit_shape_to_stations, load_shapes as load_osm_shapes
from structures import load_station_structures
from terrain import (
    BBox,
    build_bbox,
    sample_height,
    synthetic_heightmap,
    write_ground_png,
    write_terrain_bin,
)

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "web" / "public" / "data" / "v1"
TERRAIN_SIZE = 256
GRADE_CAP = 0.04
DEMO_DATE = "2026-10-27"


def load_depths(path: Path) -> dict[str, dict[str, object]]:
    with open(path, encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    depths: dict[str, dict[str, object]] = {}
    for row in rows:
        if row.get("active", "").strip() != "1":
            continue
        station_id = row["station_id"].strip()
        lines = [line.strip() for line in row.get("lines", "").split("|") if line.strip()]
        depths[station_id] = {
            "lines": lines,
            "depth_m": float(row["depth_m"]),
            "depth_source": row["depth_source"].strip(),
            "depth_basis": row["depth_basis"].strip() or "station",
            "source_url": row.get("source_url", "").strip() or None,
            "confidence_m": float(row["confidence_m"]) if row.get("confidence_m") else None,
            "alt_depth_m": float(row["alt_depth_m"]) if row.get("alt_depth_m") else None,
            "alt_source": row.get("alt_source", "").strip() or None,
            "alt_note": row.get("alt_note", "").strip() or None,
            "note": row.get("note", "").strip() or None,
        }
    return depths


def load_landmarks(path: Path) -> list[dict[str, object]]:
    landmarks: list[dict[str, object]] = []
    with open(path, encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            kind = row["kind"].strip()
            if kind not in {"landmark", "park", "water"}:
                raise ValueError(f"landmark {row['id']!r}: unknown kind {kind!r}")
            landmarks.append(
                {
                    "id": row["id"].strip(),
                    "name": row["name"].strip(),
                    "kind": kind,
                    "lat": float(row["lat"]),
                    "lon": float(row["lon"]),
                }
            )
    return landmarks


def load_elevations(path: Path) -> dict[str, dict[str, object]]:
    with open(path, encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return {
        row["station_id"]: {
            "elevation_m": float(row["elevation_m"]),
            "source": row["source"],
        }
        for row in rows
    }


def apply_grade_cap(
    depths: list[float], distances: list[float], start_depth: float, end_depth: float
) -> list[float]:
    depths = list(depths)
    for index in range(1, len(depths)):
        max_change = GRADE_CAP * max(distances[index] - distances[index - 1], 0.0)
        lower = depths[index - 1] - max_change
        upper = depths[index - 1] + max_change
        depths[index] = min(max(depths[index], lower), upper)
    for index in range(len(depths) - 2, -1, -1):
        max_change = GRADE_CAP * max(distances[index + 1] - distances[index], 0.0)
        lower = depths[index + 1] - max_change
        upper = depths[index + 1] + max_change
        depths[index] = min(max(depths[index], lower), upper)
    if abs(depths[0] - start_depth) > 0.01 or abs(depths[-1] - end_depth) > 0.01:
        raise ValueError("grade cap conflicts with fixed station anchors")
    return depths


def main() -> None:
    gtfs = Gtfs(ensure_gtfs(ROOT / "data" / "raw"))
    lines = gtfs.select_canonical()
    osm_shapes = load_osm_shapes(ROOT / "data" / "raw")
    interchanges = load_interchanges(ROOT / "pipeline" / "curated" / "interchanges.csv")
    depths = load_depths(ROOT / "pipeline" / "curated" / "station_depths.csv")
    elevations = load_elevations(ROOT / "pipeline" / "curated" / "station_elevations.csv")
    structures = load_station_structures(
        ROOT / "pipeline" / "curated" / "station_structure.csv"
    )
    landmarks = load_landmarks(ROOT / "pipeline" / "curated" / "landmarks.csv")

    stations: dict[str, dict[str, object]] = {}
    for line in lines:
        for station in line["stations"]:  # type: ignore[union-attr]
            station_id = str(station["slug"])
            ground = elevations[station_id]
            record = stations.setdefault(
                station_id,
                {
                    "id": station_id,
                    "name": station["name"],
                    "lat": station["lat"],
                    "lon": station["lon"],
                    "ground_elevation_m": float(ground["elevation_m"]),
                    "ground_elevation_source": ground["source"],
                    "platforms": {},
                },
            )
            platform: dict[str, object] = {
                "line": line["id"],
                "lat": station["lat"],
                "lon": station["lon"],
                "surface_elevation_m": 0.0,
                "ground_elevation_m": float(ground["elevation_m"]),
                "ground_elevation_source": ground["source"],
                "platform_depth_m": None,
                "depth_source": "unknown",
                "depth_basis": "platform",
                "confidence_m": None,
                "official_depth_m": None,
                "measured_depth_m": None,
                "measurement_ids": [],
                "source_url": None,
                "note": None,
            }
            curated = depths.get(station_id)
            if curated and (not curated["lines"] or line["id"] in curated["lines"]):  # type: ignore[operator]
                platform.update(
                    {
                        "platform_depth_m": curated["depth_m"],
                        "depth_source": curated["depth_source"],
                        "depth_basis": curated["depth_basis"],
                        "confidence_m": curated["confidence_m"],
                        "official_depth_m": curated["depth_m"],
                        "source_url": curated["source_url"],
                        "note": curated["note"],
                    }
                )
            record["platforms"][line["id"]] = platform  # type: ignore[index]

    if not elevations:
        raise RuntimeError(
            "missing station elevations; run python3 pipeline/dummy/fetch_elevations.py"
        )

    bbox_stations = [
        {
            "lat": float(station["lat"]),
            "lon": float(station["lon"]),
            "elevation_m": float(elevations[str(station["id"])]["elevation_m"]),
        }
        for station in stations.values()
        if str(station["id"]) in elevations
    ]
    missing_elevations = [station["id"] for station in stations.values() if str(station["id"]) not in elevations]
    if missing_elevations:
        raise RuntimeError(f"missing station elevations for: {', '.join(missing_elevations)}")

    bbox = build_bbox(bbox_stations)
    heights = synthetic_heightmap(bbox, bbox_stations, TERRAIN_SIZE)
    min_height = min(heights)
    max_height = max(heights)

    for station in stations.values():
        station["surface_elevation_m"] = sample_height(
            heights,
            TERRAIN_SIZE,
            bbox,
            float(station["lat"]),
            float(station["lon"]),
        )
        for platform in station["platforms"].values():  # type: ignore[union-attr]
            platform["surface_elevation_m"] = station["surface_elevation_m"]

    mark_records: list[dict[str, object]] = []
    for landmark in landmarks:
        lat = float(landmark["lat"])  # type: ignore[arg-type]
        lon = float(landmark["lon"])  # type: ignore[arg-type]
        if not (bbox.min_lat < lat < bbox.max_lat and bbox.min_lon < lon < bbox.max_lon):
            raise RuntimeError(
                f"landmark {landmark['id']} lies outside the station bbox; "
                "extend build_bbox margins or curate it out"
            )
        mark_records.append(
            {
                "id": landmark["id"],
                "name": landmark["name"],
                "kind": landmark["kind"],
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "surface_elevation_m": round(
                    sample_height(heights, TERRAIN_SIZE, bbox, lat, lon), 2
                ),
            }
        )

    network_lines: list[dict[str, object]] = []
    provenance_segments = {"measured": 0, "official": 0, "estimated": 0, "unknown": 0}

    for line in lines:
        line_id = str(line["id"])
        line_stations = line["stations"]  # type: ignore[assignment]
        gtfs_shape = line["shape"]  # type: ignore[assignment]
        shape = list(osm_shapes.get(line_id, gtfs_shape))
        targets: dict[str, dict[str, float]] = {}
        for station_id, interchange in interchanges.items():
            track = interchange.tracks.get(line_id)
            if track is None:
                continue
            shape, target = deform_shape_for_interchange(shape, track)
            targets[station_id] = target

        fitted_stations = []
        for station in line_stations:  # type: ignore[union-attr]
            target = targets.get(str(station["slug"]))
            if target is None:
                fitted_stations.append(station)
            else:
                fitted_stations.append(
                    {
                        "lat": target["lat"],
                        "lon": target["lon"],
                        "slug": station["slug"],
                    }
                )
        shape, station_points = fit_shape_to_stations(shape, fitted_stations)
        for index, station in enumerate(line_stations):  # type: ignore[arg-type]
            target = targets.get(str(station["slug"]))
            if target is not None:
                station_points[index] = target
        station_distances = [round(point["distance_m"], 2) for point in station_points]
        if any(
            later <= earlier
            for earlier, later in zip(station_distances, station_distances[1:])
        ):
            raise RuntimeError(
                f"non-monotonic stations on {line_id} after interchange deformation"
            )
        segments: list[dict[str, object]] = []

        for station, point in zip(line_stations, station_points, strict=True):  # type: ignore[arg-type]
            platform = stations[str(station["slug"])]["platforms"][line["id"]]  # type: ignore[index]
            platform["lat"] = point["lat"]
            platform["lon"] = point["lon"]
            platform["surface_elevation_m"] = sample_height(
                heights, TERRAIN_SIZE, bbox, point["lat"], point["lon"]
            )

        for index in range(len(line_stations) - 1):  # type: ignore[arg-type]
            start = line_stations[index]  # type: ignore[index]
            end = line_stations[index + 1]  # type: ignore[index]
            start_id = str(start["slug"])
            end_id = str(end["slug"])
            start_distance = station_distances[index]
            end_distance = station_distances[index + 1]
            if end_distance <= start_distance:
                raise RuntimeError(f"non-monotonic stations on {line['id']}: {start_id} -> {end_id}")

            slice_points = shape_slice(shape, start_distance, end_distance)
            vertices: list[dict[str, object]] = []
            for point in slice_points:
                vertices.append(
                    {
                        "lat": point["lat"],
                        "lon": point["lon"],
                        "distance_m": round(float(point["d"]), 2),
                        "surface_elevation_m": round(
                            sample_height(heights, TERRAIN_SIZE, bbox, point["lat"], point["lon"]),
                            2,
                        ),
                        "depth_m": None,
                        "source": "unknown",
                    }
                )

            segment_id = f"{line['id']}:{'-'.join(sorted((start_id, end_id)))}"
            segments.append(
                {
                    "id": segment_id,
                    "from": start_id,
                    "to": end_id,
                    "depth_source": "unknown",
                    "vertices": vertices,
                }
            )

        anchors: list[tuple[float, float]] = []
        for index, station in enumerate(line_stations):  # type: ignore[arg-type]
            platform = stations[str(station["slug"])]["platforms"][line["id"]]  # type: ignore[index]
            if platform["platform_depth_m"] is not None:
                anchors.append(
                    (station_distances[index], float(platform["platform_depth_m"]))
                )

        all_vertices = [
            vertex
            for segment in segments
            for vertex in segment["vertices"]  # type: ignore[union-attr]
        ]
        for anchor_index in range(len(anchors) - 1):
            start_distance, start_depth = anchors[anchor_index]
            end_distance, end_depth = anchors[anchor_index + 1]
            span = [
                vertex
                for vertex in all_vertices
                if start_distance <= float(vertex["distance_m"]) <= end_distance  # type: ignore[arg-type]
            ]
            span.sort(key=lambda vertex: float(vertex["distance_m"]))  # type: ignore[arg-type]
            distances = [float(vertex["distance_m"]) for vertex in span]  # type: ignore[arg-type]
            linear = [
                start_depth
                + (distance - start_distance) / (end_distance - start_distance)
                * (end_depth - start_depth)
                for distance in distances
            ]
            capped = apply_grade_cap(linear, distances, start_depth, end_depth)
            for vertex, depth in zip(span, capped, strict=True):
                vertex["depth_m"] = round(depth, 2)
                vertex["source"] = "estimated"

        for segment in segments:
            segment_vertices = segment["vertices"]  # type: ignore[assignment]
            source = (
                "estimated"
                if all(vertex["depth_m"] is not None for vertex in segment_vertices)  # type: ignore[union-attr]
                else "unknown"
            )
            segment["depth_source"] = source
            if source == "unknown":
                for vertex in segment_vertices:
                    vertex["depth_m"] = None
                    vertex["source"] = "unknown"
            provenance_segments[source] += 1

        network_lines.append(
            {
                "id": line["id"],
                "name": line["name"],
                "short_name": line["short_name"],
                "color": line["color"],
                "direction": line["direction"],
                "headsign": line["headsign"],
                "shape_id": line["shape_id"],
                "segments": segments,
            }
        )

    station_records: list[dict[str, object]] = []
    interchange_metadata = {
        station_id: {
            "kind": "parallel",
            "axis_bearing_deg": interchange.bearing_deg,
            "spacing_m": round(interchange.spacing_m, 2),
            "platform_length_m": interchange.platform_length_m,
            "platform_width_m": interchange.platform_width_m,
        }
        for station_id, interchange in interchanges.items()
    }
    structure_metadata = dict(structures)
    for station_id, interchange in interchanges.items():
        known = structure_metadata.get(station_id)
        if known is not None and known != interchange.structure:
            raise RuntimeError(
                f"{station_id}: station_structure.csv says {known}, "
                f"interchanges.csv says {interchange.structure}"
            )
        structure_metadata[station_id] = interchange.structure
    provenance_platforms = {"measured": 0, "official": 0, "estimated": 0, "unknown": 0}
    for station in sorted(stations.values(), key=lambda item: str(item["name"])):
        platforms = []
        for line_id in sorted(station["platforms"]):  # type: ignore[union-attr]
            platform = station["platforms"][line_id]  # type: ignore[index]
            platforms.append(
                {
                    "line": platform["line"],
                    "lat": round(float(platform["lat"]), 6),
                    "lon": round(float(platform["lon"]), 6),
                    "surface_elevation_m": round(float(platform["surface_elevation_m"]), 2),
                    "ground_elevation_m": round(float(platform["ground_elevation_m"]), 2),
                    "ground_elevation_source": platform["ground_elevation_source"],
                    "platform_depth_m": platform["platform_depth_m"],
                    "depth_source": platform["depth_source"],
                    "depth_basis": platform["depth_basis"],
                    "confidence_m": platform["confidence_m"],
                    "official_depth_m": platform["official_depth_m"],
                    "measured_depth_m": platform["measured_depth_m"],
                    "measurement_ids": platform["measurement_ids"],
                    "source_url": platform["source_url"],
                    "note": platform["note"],
                }
            )
            provenance_platforms[str(platform["depth_source"])] += 1
        record: dict[str, object] = {
            "id": station["id"],
            "name": station["name"],
            "lat": round(float(station["lat"]), 6),
            "lon": round(float(station["lon"]), 6),
            "surface_elevation_m": round(float(station["surface_elevation_m"]), 2),
            "ground_elevation_m": round(float(station["ground_elevation_m"]), 2),
            "ground_elevation_source": station["ground_elevation_source"],
            "lines": [platform["line"] for platform in platforms],
            "platforms": platforms,
        }
        station_id = str(station["id"])
        if station_id in interchange_metadata:
            record["interchange"] = interchange_metadata[station_id]
        if station_id in structure_metadata:
            record["structure"] = structure_metadata[station_id]
        station_records.append(record)

    manifest = {
        "schema_version": 1,
        "dataset_version": f"{DEMO_DATE}.dummy",
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "demo": True,
        "capabilities": {
            "real_terrain": False,
            "measured_depths": False,
            "streets": False,
        },
        "bbox": {
            "min_lat": round(bbox.min_lat, 6),
            "max_lat": round(bbox.max_lat, 6),
            "min_lon": round(bbox.min_lon, 6),
            "max_lon": round(bbox.max_lon, 6),
        },
        "terrain": {
            "kind": "synthetic-illustrative",
            "file": "terrain.bin",
            "texture": "ground.png",
            "width": TERRAIN_SIZE,
            "height": TERRAIN_SIZE,
            "min_m": round(min_height, 2),
            "max_m": round(max_height, 2),
            "size_m": {"width": round(bbox.width_m, 2), "height": round(bbox.height_m, 2)},
        },
        "counts": {
            "stations": len(station_records),
            "lines": len(network_lines),
            "platforms": sum(len(station["platforms"]) for station in station_records),
            "segments": sum(len(line["segments"]) for line in network_lines),
            "landmarks": len(mark_records),
        },
        "provenance_counts": {
            "platforms": provenance_platforms,
            "segments": provenance_segments,
        },
        "attribution": [
            {
                "name": "Metropolitano de Lisboa",
                "role": "GTFS line shapes, stops, and timetable",
                "url": "https://dados.gov.pt/",
            },
            {
                "name": "OpenStreetMap contributors",
                "role": "Metro route and platform geometry (ODbL)",
                "url": "https://www.openstreetmap.org/copyright",
            },
            {
                "name": "Open-Meteo Elevation API",
                "role": "Station surface elevation samples (Copernicus DEM)",
                "url": "https://open-meteo.com/en/docs/elevation-api",
            },
        ],
        "source_notes": [
            "Terrain is synthetic and illustrative. It is not a survey.",
            "Tunnel alignment follows OpenStreetMap route geometry, not the coarse GTFS shape.",
            "Baixa-Chiado and Campo Grande are cross-platform interchanges; their parallel station geometry is curated from OSM platform ways.",
            "Official station depths are station-level values, not platform-level measurements.",
            "Unknown depths remain null. No underground geometry is drawn where depth is unknown.",
            "Measured survey data will replace estimated segments without changing the viewer.",
            "Toggle X-ray terrain to see estimated tunnels below the surface.",
            "Station ground elevations come from the Copernicus DEM; the 3D terrain is synthetic.",
            "Tunnel slopes are averages between platform anchors, not continuous surveyed grades.",
            "Landmark positions and kinds are curated; surface elevations are sampled on the synthetic terrain.",
        ],
        "demo_note": "Local demo: real OSM/GTFS geometry, documented depths only, synthetic terrain. Toggle X-ray terrain to see estimated tunnels.",
    }

    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (OUTPUT / "stations.json").write_text(
        json.dumps(station_records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (OUTPUT / "landmarks.json").write_text(
        json.dumps(mark_records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (OUTPUT / "network.json").write_text(
        json.dumps({"lines": network_lines}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    write_terrain_bin(OUTPUT / "terrain.bin", heights)
    write_ground_png(OUTPUT / "ground.png", heights, TERRAIN_SIZE, bbox)

    print(f"wrote {OUTPUT}")
    print(
        f"stations={len(station_records)} lines={len(network_lines)} "
        f"segments={manifest['counts']['segments']} landmarks={len(mark_records)}"
    )
    print(f"terrain={bbox.width_m:.0f}m x {bbox.height_m:.0f}m, height {min_height:.1f}..{max_height:.1f}m")


if __name__ == "__main__":
    main()
