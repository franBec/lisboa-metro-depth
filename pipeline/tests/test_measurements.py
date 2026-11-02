from __future__ import annotations

import hashlib
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "measurements"
sys.path.insert(0, str(ROOT / "pipeline" / "ingest"))

from read_log import read_log  # noqa: E402


class MeasurementIndexTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
        cls.sessions = cls.index["sessions"]

    def test_index_metadata(self) -> None:
        self.assertEqual(self.index["schema_version"], 1)
        self.assertEqual(self.index["license"], "CC-BY-4.0")
        self.assertTrue(self.index["attribution"])
        self.assertTrue(self.sessions)

        session_ids = set()
        files = set()
        for session in self.sessions:
            self.assertNotIn(session["session_id"], session_ids)
            session_ids.add(session["session_id"])
            self.assertNotIn(session["file"], files)
            files.add(session["file"])
            self.assertIn(session["kind"], {"bench", "survey", "poc"})
            self.assertGreater(session["rows"], 0)
            self.assertGreater(session["bytes"], 0)

    def test_files_match_index(self) -> None:
        for session in self.sessions:
            path = DATA / session["file"]
            self.assertTrue(path.is_file(), session["file"])
            data = path.read_bytes()
            self.assertEqual(len(data), session["bytes"], session["file"])
            self.assertEqual(hashlib.sha256(data).hexdigest(), session["sha256"], session["file"])

    def test_pilot_is_demoted(self) -> None:
        by_id = {session["session_id"]: session for session in self.sessions}
        self.assertEqual(by_id["LX_3193"]["kind"], "poc")

    def test_files_parse(self) -> None:
        for session in self.sessions:
            rows = read_log(DATA / session["file"])
            self.assertEqual(len(rows), session["rows"], session["file"])


if __name__ == "__main__":
    unittest.main()
