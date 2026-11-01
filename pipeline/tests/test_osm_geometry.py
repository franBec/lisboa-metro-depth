from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "dummy"))

from osm import (  # noqa: E402
    _assemble_polyline,
    _parse_relation,
    _with_distances,
    fit_shape_to_stations,
)

RELATION_XML = """\
<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="38.7000" lon="-9.1500"/>
  <node id="2" lat="38.7010" lon="-9.1500"/>
  <node id="3" lat="38.7020" lon="-9.1500"/>
  <node id="4" lat="38.7030" lon="-9.1500"/>
  <way id="10">
    <nd ref="1"/>
    <nd ref="2"/>
  </way>
  <way id="11">
    <nd ref="4"/>
    <nd ref="3"/>
    <nd ref="2"/>
  </way>
  <relation id="99">
    <member type="way" ref="10" role=""/>
    <member type="way" ref="11" role=""/>
  </relation>
</osm>
"""


class OsmGeometryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.path = Path(self.temporary.name) / "relation.xml"
        self.path.write_text(RELATION_XML, encoding="utf-8")

    def test_assembly_stitches_ways_in_order(self) -> None:
        nodes, ways, members = _parse_relation(self.path)
        polyline = _assemble_polyline(nodes, ways, members)
        self.assertEqual(
            polyline,
            [
                (38.7000, -9.1500),
                (38.7010, -9.1500),
                (38.7020, -9.1500),
                (38.7030, -9.1500),
            ],
        )

    def test_shape_orients_to_station_order(self) -> None:
        nodes, ways, members = _parse_relation(self.path)
        shape = _with_distances(_assemble_polyline(nodes, ways, members))
        stations = [
            {"lat": 38.7030, "lon": -9.1500},
            {"lat": 38.7000, "lon": -9.1500},
        ]
        oriented, projected = fit_shape_to_stations(shape, stations)
        self.assertEqual(oriented[0]["lat"], 38.7030)
        self.assertEqual(oriented[-1]["lat"], 38.7000)
        self.assertGreater(projected[1]["distance_m"], projected[0]["distance_m"])


if __name__ == "__main__":
    unittest.main()
