"""Fetch and assemble OpenStreetMap route geometry for the Lisbon Metro lines.

The GTFS feed only carries a handful of shape points, so every station pair is a
straight chord. The OSM route relations trace the actual track alignment. They
are pinned by relation id and cached under ``data/raw/osm/`` like the GTFS feed.
"""

from __future__ import annotations

import math
import os
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from gtfs import project_point_to_shape

OSM_API = "https://api.openstreetmap.org/api/0.6/relation/{relation_id}/full"
OSM_USER_AGENT = "lisboa-metro-depth/0.1 (+local research build)"
EARTH_RADIUS_M = 6_371_000.0

# Direction of each relation matches the canonical GTFS direction used by the
# build. Relation ids come from the route_master members, verified 2026-11-01.
OSM_RELATION_IDS = {
    "A": 371021,  # Linha Azul: Santa Apolónia -> Reboleira
    "B": 7734162,  # Linha Amarela: Odivelas -> Rato
    "C": 7734160,  # Linha Verde: Telheiras -> Cais do Sodré
    "D": 371084,  # Linha Vermelha: São Sebastião -> Aeroporto
}


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def ensure_osm(raw_dir: Path) -> Path:
    cache = raw_dir / "osm"
    cache.mkdir(parents=True, exist_ok=True)
    for line_id, relation_id in OSM_RELATION_IDS.items():
        path = cache / f"{line_id}-{relation_id}.xml"
        if path.exists() and path.stat().st_size > 0:
            continue

        request = urllib.request.Request(
            OSM_API.format(relation_id=relation_id),
            headers={"User-Agent": OSM_USER_AGENT},
        )
        tmp = path.with_suffix(".part")
        with urllib.request.urlopen(request, timeout=120) as response:
            with open(tmp, "wb") as handle:
                while True:
                    chunk = response.read(1024 * 256)
                    if not chunk:
                        break
                    handle.write(chunk)
        os.replace(tmp, path)
    return cache


def _parse_relation(path: Path) -> tuple[
    dict[str, tuple[float, float]], dict[str, list[str]], list[ET.Element]
]:
    root = ET.parse(path).getroot()
    nodes = {
        node.get("id", ""): (float(node.get("lat", "nan")), float(node.get("lon", "nan")))
        for node in root.findall("node")
    }
    ways = {
        way.get("id", ""): [nd.get("ref", "") for nd in way.findall("nd")]
        for way in root.findall("way")
    }
    relation = root.find("relation")
    if relation is None:
        raise RuntimeError(f"no relation in {path}")
    return nodes, ways, list(relation.findall("member"))


def _assemble_polyline(
    nodes: dict[str, tuple[float, float]],
    ways: dict[str, list[str]],
    members: list[ET.Element],
) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for member in members:
        if member.get("type") != "way":
            continue
        refs = list(ways.get(member.get("ref", ""), []))
        if not refs:
            continue
        if points:
            last = points[-1]
            forward = haversine_m(*last, *nodes[refs[0]])
            backward = haversine_m(*last, *nodes[refs[-1]])
            if backward < forward:
                refs.reverse()
        for ref in refs:
            point = nodes[ref]
            if not points or points[-1] != point:
                points.append(point)
    return points


def _with_distances(
    points: list[tuple[float, float]]
) -> list[dict[str, float]]:
    shape: list[dict[str, float]] = []
    distance = 0.0
    previous: tuple[float, float] | None = None
    for lat, lon in points:
        if previous is not None:
            distance += haversine_m(previous[0], previous[1], lat, lon)
        shape.append({"lat": lat, "lon": lon, "d": distance})
        previous = (lat, lon)
    return shape


def _reverse_shape(shape: list[dict[str, float]]) -> list[dict[str, float]]:
    points = list(reversed(shape))
    return _with_distances([(point["lat"], point["lon"]) for point in points])


def fit_shape_to_stations(
    shape: list[dict[str, float]], stations: list[dict[str, object]]
) -> tuple[list[dict[str, float]], list[dict[str, float]]]:
    """Orient the shape along the station order and project every station on it."""
    for candidate in (shape, _reverse_shape(shape)):
        projected = [
            project_point_to_shape(
                float(station["lat"]), float(station["lon"]), candidate
            )
            for station in stations
        ]
        distances = [point["distance_m"] for point in projected]
        if all(later > earlier for earlier, later in zip(distances, distances[1:])):
            return candidate, projected
    raise RuntimeError("shape does not follow the GTFS station order")


def load_shapes(raw_dir: Path) -> dict[str, list[dict[str, float]]]:
    cache = ensure_osm(raw_dir)
    shapes: dict[str, list[dict[str, float]]] = {}
    for line_id, relation_id in OSM_RELATION_IDS.items():
        nodes, ways, members = _parse_relation(cache / f"{line_id}-{relation_id}.xml")
        shapes[line_id] = _with_distances(_assemble_polyline(nodes, ways, members))
    return shapes
