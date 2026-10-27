"""Small dependency-free PNG writer for the dummy ground texture."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


def _chunk(tag: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + tag
        + payload
        + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
    )


def write_png(path: Path, width: int, height: int, rows: list[bytearray]) -> None:
    if len(rows) != height:
        raise ValueError("row count does not match height")
    raw = bytearray()
    for row in rows:
        if len(row) != width * 3:
            raise ValueError("row width does not match width")
        raw.append(0)
        raw.extend(row)
    payload = zlib.compress(bytes(raw), 6)
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(b"\x89PNG\r\n\x1a\n")
        handle.write(_chunk(b"IHDR", header))
        handle.write(_chunk(b"IDAT", payload))
        handle.write(_chunk(b"IEND", b""))
