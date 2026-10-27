"""Synthetic terrain and ground texture generation for the local demo."""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass
from pathlib import Path

from png import write_png

CELL_SIZE_M = 42.0
RIVER = [
    (-9.25, 38.690),
    (-9.21, 38.694),
    (-9.17, 38.700),
    (-9.14, 38.704),
    (-9.12, 38.710),
    (-9.105, 38.720),
    (-9.095, 38.735),
    (-9.085, 38.752),
    (-9.075, 38.770),
]
PARKS = [
    (-9.190, 38.735, 1150.0, "Monsanto"),
    (-9.154, 38.737, 360.0, "Gulbenkian"),
    (-9.160, 38.760, 520.0, "Campo Grande"),
    (-9.160, 38.713, 300.0, "Estrela"),
]


@dataclass(frozen=True)
class BBox:
    min_lat: float
    max_lat: float
    min_lon: float
    max_lon: float
    width_m: float
    height_m: float

    @property
    def mid_lat(self) -> float:
        return (self.min_lat + self.max_lat) / 2

    @property
    def mid_lon(self) -> float:
        return (self.min_lon + self.max_lon) / 2


def build_bbox(stations: list[dict[str, float]], margin_m: float = 1500.0) -> BBox:
    min_lat = min(float(station["lat"]) for station in stations)
    max_lat = max(float(station["lat"]) for station in stations)
    min_lon = min(float(station["lon"]) for station in stations)
    max_lon = max(float(station["lon"]) for station in stations)
    mid_lat = (min_lat + max_lat) / 2
    lat_margin = margin_m / 110_540.0
    lon_margin = margin_m / (111_320.0 * math.cos(math.radians(mid_lat)))
    south_margin = 3200.0 / 110_540.0
    east_margin = 3000.0 / (111_320.0 * math.cos(math.radians(mid_lat)))
    min_lat -= south_margin
    max_lat += lat_margin
    min_lon -= lon_margin
    max_lon += east_margin
    width_m = (max_lon - min_lon) * 111_320.0 * math.cos(math.radians(mid_lat))
    height_m = (max_lat - min_lat) * 110_540.0
    return BBox(min_lat, max_lat, min_lon, max_lon, width_m, height_m)


def river_lat(lon: float) -> float:
    if lon <= RIVER[0][0]:
        return RIVER[0][1]
    if lon >= RIVER[-1][0]:
        return RIVER[-1][1]
    for index in range(len(RIVER) - 1):
        lon_a, lat_a = RIVER[index]
        lon_b, lat_b = RIVER[index + 1]
        if lon_a <= lon <= lon_b:
            t = (lon - lon_a) / (lon_b - lon_a)
            return lat_a + t * (lat_b - lat_a)
    return RIVER[-1][1]


def is_water(lat: float, lon: float) -> bool:
    return lat < river_lat(lon) + 0.0024


def local_xy(bbox: BBox, lat: float, lon: float) -> tuple[float, float]:
    x = (lon - bbox.min_lon) * 111_320.0 * math.cos(math.radians(bbox.mid_lat))
    z = (bbox.max_lat - lat) * 110_540.0
    return x, z


def _idw(
    lat: float, lon: float, stations: list[dict[str, float]], mid_lat: float
) -> float:
    total_weight = 0.0
    total_value = 0.0
    for station in stations:
        dx = (lon - float(station["lon"])) * 111_320.0 * math.cos(math.radians(mid_lat))
        dz = (lat - float(station["lat"])) * 110_540.0
        distance_sq = dx * dx + dz * dz
        if distance_sq < 1.0:
            return float(station["elevation_m"])
        weight = 1.0 / (distance_sq + 1500.0)
        total_weight += weight
        total_value += weight * float(station["elevation_m"])
    return total_value / total_weight if total_weight else 0.0


def synthetic_heightmap(
    bbox: BBox,
    stations: list[dict[str, float]],
    size: int = 256,
) -> list[float]:
    heights: list[float] = []
    for row in range(size):
        lat = bbox.max_lat - (row / (size - 1)) * (bbox.max_lat - bbox.min_lat)
        for col in range(size):
            lon = bbox.min_lon + (col / (size - 1)) * (bbox.max_lon - bbox.min_lon)
            if is_water(lat, lon):
                heights.append(0.0)
                continue
            x, z = local_xy(bbox, lat, lon)
            elevation = _idw(lat, lon, stations, bbox.mid_lat)
            hills = (
                7.0 * math.sin(x / 1900.0 + 0.4) * math.cos(z / 2400.0)
                + 4.0 * math.sin(x / 850.0 + 1.1) * math.cos(z / 1250.0 + 0.7)
            )
            coast_distance = max(lat - (river_lat(lon) + 0.0024), 0.0)
            coast_factor = min(coast_distance / 0.0063, 1.0)
            heights.append(max(0.5, (elevation + hills) * (0.24 + 0.76 * coast_factor)))

    for _ in range(2):
        heights = _smooth(heights, size)

    for row in range(size):
        lat = bbox.max_lat - (row / (size - 1)) * (bbox.max_lat - bbox.min_lat)
        for col in range(size):
            lon = bbox.min_lon + (col / (size - 1)) * (bbox.max_lon - bbox.min_lon)
            if is_water(lat, lon):
                heights[row * size + col] = 0.0
    return heights


def _smooth(values: list[float], size: int) -> list[float]:
    output = [0.0] * len(values)
    for row in range(size):
        for col in range(size):
            total = 0.0
            count = 0
            for dr in (-1, 0, 1):
                rr = row + dr
                if rr < 0 or rr >= size:
                    continue
                for dc in (-1, 0, 1):
                    cc = col + dc
                    if cc < 0 or cc >= size:
                        continue
                    total += values[rr * size + cc]
                    count += 1
            output[row * size + col] = total / count
    return output


def sample_height(
    heights: list[float], size: int, bbox: BBox, lat: float, lon: float
) -> float:
    fx = (lon - bbox.min_lon) / (bbox.max_lon - bbox.min_lon) * (size - 1)
    fy = (bbox.max_lat - lat) / (bbox.max_lat - bbox.min_lat) * (size - 1)
    fx = min(max(fx, 0.0), size - 1)
    fy = min(max(fy, 0.0), size - 1)
    x0 = int(fx)
    y0 = int(fy)
    x1 = min(x0 + 1, size - 1)
    y1 = min(y0 + 1, size - 1)
    tx = fx - x0
    ty = fy - y0
    h00 = heights[y0 * size + x0]
    h10 = heights[y0 * size + x1]
    h01 = heights[y1 * size + x0]
    h11 = heights[y1 * size + x1]
    return (
        h00 * (1 - tx) * (1 - ty)
        + h10 * tx * (1 - ty)
        + h01 * (1 - tx) * ty
        + h11 * tx * ty
    )


def write_terrain_bin(path: Path, heights: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = struct.pack(f"<{len(heights)}f", *heights)
    path.write_bytes(payload)


def _hillshade(heights: list[float], size: int) -> list[float]:
    cell = (CELL_SIZE_M,) * 2
    sun = (-0.55, 0.72, -0.42)
    sun_len = math.sqrt(sum(component * component for component in sun))
    sun = tuple(component / sun_len for component in sun)
    shade: list[float] = []
    for row in range(size):
        for col in range(size):
            left = heights[row * size + max(col - 1, 0)]
            right = heights[row * size + min(col + 1, size - 1)]
            north = heights[max(row - 1, 0) * size + col]
            south = heights[min(row + 1, size - 1) * size + col]
            dx = (right - left) / (2 * cell[0])
            dz = (south - north) / (2 * cell[1])
            nx = -dx
            ny = 1.0
            nz = -dz
            length = math.sqrt(nx * nx + ny * ny + nz * nz)
            dot = (nx * sun[0] + ny * sun[1] + nz * sun[2]) / length
            shade.append(min(1.16, max(0.34, 0.58 + 0.62 * max(0.0, dot))))
    return shade


def _bilinear(values: list[float], size: int, fx: float, fy: float) -> float:
    x = min(max(fx, 0.0), size - 1)
    y = min(max(fy, 0.0), size - 1)
    x0 = int(x)
    y0 = int(y)
    x1 = min(x0 + 1, size - 1)
    y1 = min(y0 + 1, size - 1)
    tx = x - x0
    ty = y - y0
    return (
        values[y0 * size + x0] * (1 - tx) * (1 - ty)
        + values[y0 * size + x1] * tx * (1 - ty)
        + values[y1 * size + x0] * (1 - tx) * ty
        + values[y1 * size + x1] * tx * ty
    )


def _mix(a: tuple[float, float, float], b: tuple[float, float, float], t: float) -> tuple[float, float, float]:
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))  # type: ignore[return-value]


def write_ground_png(
    path: Path,
    heights: list[float],
    size: int,
    bbox: BBox,
    texture_size: int = 1024,
) -> None:
    shade = _hillshade(heights, size)
    min_height = min(heights)
    max_height = max(heights)
    span = max(max_height - min_height, 1.0)
    park_m = [
        (*local_xy(bbox, lat, lon), radius)
        for lon, lat, radius, _name in PARKS
    ]
    rows: list[bytearray] = []
    for py in range(texture_size):
        fy = py / (texture_size - 1)
        lat = bbox.max_lat - fy * (bbox.max_lat - bbox.min_lat)
        row = bytearray()
        for px in range(texture_size):
            fx = px / (texture_size - 1)
            lon = bbox.min_lon + fx * (bbox.max_lon - bbox.min_lon)
            h = _bilinear(heights, size, fx * (size - 1), fy * (size - 1))
            light = _bilinear(shade, size, fx * (size - 1), fy * (size - 1))
            x, z = local_xy(bbox, lat, lon)
            noise = (((px * 73856093) ^ (py * 19349663) ^ (px * py * 83492791)) & 255) / 255.0

            if is_water(lat, lon):
                ripple = 0.92 + 0.08 * math.sin(x / 260.0 + z / 390.0)
                color = (31 * ripple, 63 * ripple, 81 * ripple)
            else:
                t = min(max((h - min_height) / span, 0.0), 1.0)
                color = _mix((176.0, 169.0, 143.0), (103.0, 137.0, 104.0), t)
                for park_x, park_z, radius in park_m:
                    distance = math.hypot(x - park_x, z - park_z)
                    if distance < radius:
                        color = _mix(color, (53.0, 91.0, 64.0), 0.72 * (1 - distance / radius))
                city_distance = math.hypot(x - bbox.width_m * 0.58, z - bbox.height_m * 0.47)
                if city_distance < 3600.0:
                    color = _mix(color, (168.0, 156.0, 131.0), 0.3 * (1 - city_distance / 3600.0))
                contour = abs((h % 20.0) - 10.0)
                if contour < 0.38:
                    color = tuple(component * 0.91 for component in color)
                color = tuple(component * light * (0.97 + noise * 0.06) for component in color)

            row.extend(
                (
                    int(min(255, max(0, color[0]))),
                    int(min(255, max(0, color[1]))),
                    int(min(255, max(0, color[2]))),
                )
            )
        rows.append(row)
    write_png(path, texture_size, texture_size, rows)
