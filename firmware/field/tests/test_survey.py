"""Desktop tests for the field survey state machine.

Runs under CPython with a stub clock, so the pure logic can be checked without
flashing the Cardputer:

    python3 firmware/field/tests/test_survey.py
"""

import math
import pathlib
import sys
import tempfile
import time
import unittest

FIELD = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FIELD))

NOW = [0]


def _ticks_ms():
    return NOW[0]


time.ticks_ms = _ticks_ms
time.ticks_diff = lambda a, b: a - b
time.ticks_add = lambda a, b: a + b
time.sleep_ms = lambda ms: None

import config  # noqa: E402
import survey as survey_module  # noqa: E402
from survey import Survey  # noqa: E402


class FakeLogger:
    def __init__(self):
        self.rows = []
        self.file = True
        self.seq = 0

    def write_sample(self, now, mode, ctx, pressure, temp, humidity, depth, battery):
        self.seq += 1
        self.rows.append(
            {
                "kind": "sample",
                "mode": mode,
                "ctx": dict(ctx or {}),
                "event": "",
                "pressure": pressure,
                "depth": depth,
                "note": "",
            }
        )

    def write_event(
        self, now, mode, ctx, event, pressure, temp, humidity, depth, battery, note=""
    ):
        self.seq += 1
        self.rows.append(
            {
                "kind": "event",
                "mode": mode,
                "ctx": dict(ctx or {}),
                "event": event,
                "pressure": pressure,
                "depth": depth,
                "note": note,
                "seq": self.seq,
            }
        )
        return self.seq

    def close_session(self, now, battery=None):
        self.file = False
        return "fake.csv"

    def events(self, name):
        return [row for row in self.rows if row["event"] == name]


def feed(machine, seconds, pressure, temp=20.0, humidity=50.0):
    for _ in range(int(seconds)):
        NOW[0] += 1000
        machine.on_sample(NOW[0], pressure, temp, humidity, 4.0)


class SurveyTest(unittest.TestCase):
    def setUp(self):
        NOW[0] = 1000
        self.tmp = tempfile.mkdtemp()
        survey_module.SD_PATH = self.tmp
        self.logger = FakeLogger()
        self.survey = Survey(self.logger, log_line=lambda text: None)

    def select(self, line_key, station_moves=0):
        self.survey.handle_key(ord(line_key), NOW[0], 101325.0, 20.0, 50.0, 4.0)
        for _ in range(station_moves):
            self.survey.handle_key(ord("."), NOW[0], 101325.0, 20.0, 50.0, 4.0)

    def test_idle_samples_are_logged_with_empty_context(self):
        feed(self.survey, 3, 101325.0)
        samples = [row for row in self.logger.rows if row["kind"] == "sample"]
        self.assertEqual(len(samples), 3)
        self.assertEqual(samples[0]["mode"], "idle")
        self.assertEqual(samples[0]["ctx"], {})

    def test_station_order_matches_itinerary(self):
        self.select("2")
        self.assertEqual(self.survey.station_id, "odivelas")
        for expected in ("senhor-roubado", "ameixoeira", "lumiar"):
            self.survey.handle_key(ord("."), NOW[0], 101325.0, 20.0, 50.0, 4.0)
            self.assertEqual(self.survey.station_id, expected)

    def test_surface_then_platform_positive_depth(self):
        self.select("2")
        self.survey.handle_key(ord("s"), NOW[0], 101325.0, 20.0, 50.0, 4.0)
        feed(self.survey, 60, 101325.0)
        surface = self.logger.events("SURFACE")
        self.assertEqual(len(surface), 1)
        self.assertEqual(surface[0]["ctx"]["entrance"], "1")

        platform_pressure = 101325.0 + 300.0
        self.survey.handle_key(ord("p"), NOW[0], platform_pressure, 20.0, 50.0, 4.0)
        feed(self.survey, 45, platform_pressure)
        platform = self.logger.events("PLATFORM")
        self.assertEqual(len(platform), 1)
        expected = 8434.0 * math.log(platform_pressure / 101325.0)
        self.assertAlmostEqual(platform[0]["depth"], expected, places=3)
        self.assertGreater(platform[0]["depth"], 20.0)
        self.assertEqual(platform[0]["ctx"]["ref_entrance"], "1")

    def test_elevated_platform_is_negative(self):
        self.select("2")
        self.survey.handle_key(ord("s"), NOW[0], 101325.0, 20.0, 50.0, 4.0)
        feed(self.survey, 60, 101325.0)
        high = 101325.0 - 70.0
        self.survey.handle_key(ord("p"), NOW[0], high, 20.0, 50.0, 4.0)
        feed(self.survey, 45, high)
        platform = self.logger.events("PLATFORM")[0]
        self.assertLess(platform["depth"], 0)
        self.assertAlmostEqual(platform["depth"], 8434.0 * math.log(high / 101325.0))

    def test_platform_without_surface_is_kept(self):
        self.select("2")
        self.survey.handle_key(ord("p"), NOW[0], 101200.0, 20.0, 50.0, 4.0)
        feed(self.survey, 45, 101200.0)
        platform = self.logger.events("PLATFORM")
        self.assertEqual(len(platform), 1)
        self.assertIsNone(platform[0]["depth"])
        self.assertEqual(platform[0]["ctx"]["ref_entrance"], "")
        self.assertIn("no-ref", platform[0]["note"])

    def test_second_entrance_has_its_own_surface(self):
        self.select("2")
        self.survey.handle_key(ord("s"), NOW[0], 101325.0, 20.0, 50.0, 4.0)
        feed(self.survey, 60, 101325.0)
        self.survey.handle_key(ord("e"), NOW[0], 101325.0, 20.0, 50.0, 4.0)
        self.assertEqual(self.survey.entrance, 2)
        self.survey.handle_key(ord("s"), NOW[0], 101400.0, 20.0, 50.0, 4.0)
        feed(self.survey, 60, 101400.0)
        self.survey.handle_key(ord("p"), NOW[0], 101600.0, 20.0, 50.0, 4.0)
        feed(self.survey, 45, 101600.0)
        platform = self.logger.events("PLATFORM")[0]
        self.assertEqual(platform["ctx"]["entrance"], "2")
        self.assertEqual(platform["ctx"]["ref_entrance"], "2")
        expected = 8434.0 * math.log(101600.0 / 101400.0)
        self.assertAlmostEqual(platform["depth"], expected, places=3)

    def test_anchors_keep_sign_and_entrance(self):
        self.select("2")
        self.survey.handle_key(ord("s"), NOW[0], 101325.0, 20.0, 50.0, 4.0)
        feed(self.survey, 60, 101325.0)
        high = 101325.0 - 70.0
        self.survey.handle_key(ord("p"), NOW[0], high, 20.0, 50.0, 4.0)
        feed(self.survey, 45, high)
        path = pathlib.Path(self.tmp) / "anchors.csv"
        text = path.read_text()
        self.assertIn("line,station,entrance,depth_m", text)
        depth = float(text.strip().split("\n")[1].split(",")[3])
        self.assertLess(depth, 0)

        reloaded = Survey(FakeLogger(), log_line=lambda text: None)
        self.assertLess(reloaded.anchors_depth[("B", "odivelas")], 0)
        self.assertEqual(reloaded.anchors_entrance[("B", "odivelas")], "1")

    def test_ride_stop_advances_station(self):
        self.select("2")
        self.survey.handle_key(ord("r"), NOW[0], 101325.0, 20.0, 50.0, 4.0)
        self.assertEqual(self.survey.mode, "ride")
        self.assertEqual(self.survey.rate_hz, config.RIDE_RATE_HZ)
        self.survey.handle_key(ord("k"), NOW[0], 101320.0, 20.0, 50.0, 4.0)
        self.assertEqual(self.survey.station_id, "senhor-roubado")
        stops = self.logger.events("STATION_STOP")
        self.assertEqual(len(stops), 1)
        self.assertEqual(stops[0]["ctx"]["station"], "odivelas")
        self.survey.handle_key(ord("r"), NOW[0], 101320.0, 20.0, 50.0, 4.0)
        self.assertEqual(self.survey.mode, "station")

    def test_tunnel_stop_does_not_advance(self):
        self.select("2")
        self.survey.handle_key(ord("r"), NOW[0], 101325.0, 20.0, 50.0, 4.0)
        self.survey.handle_key(ord("t"), NOW[0], 101100.0, 20.0, 50.0, 4.0)
        self.assertEqual(self.survey.station_id, "odivelas")
        tunnel = self.logger.events("TUNNEL_STOP")
        self.assertEqual(len(tunnel), 1)
        self.assertIsNone(tunnel[0]["depth"])

    def test_tunnel_stop_outside_ride_is_ignored(self):
        self.select("2")
        self.survey.handle_key(ord("t"), NOW[0], 101100.0, 20.0, 50.0, 4.0)
        self.assertEqual(self.logger.events("TUNNEL_STOP"), [])
        self.assertIn("no ride", self.survey.message)

    def test_undo_rewinds_and_voids_last_stop(self):
        self.select("2")
        self.survey.handle_key(ord("r"), NOW[0], 101325.0, 20.0, 50.0, 4.0)
        self.survey.handle_key(ord("k"), NOW[0], 101320.0, 20.0, 50.0, 4.0)
        self.assertEqual(self.survey.station_id, "senhor-roubado")
        stop = self.logger.events("STATION_STOP")[0]
        self.survey.handle_key(ord("u"), NOW[0], 101320.0, 20.0, 50.0, 4.0)
        self.assertEqual(self.survey.station_id, "odivelas")
        void = self.logger.events("STOP_VOID")
        self.assertEqual(len(void), 1)
        self.assertEqual(void[0]["ctx"]["station"], "odivelas")
        self.assertEqual(void[0]["note"], "void seq %d" % stop["seq"])

    def test_undo_without_stop_does_nothing(self):
        self.select("2")
        self.survey.handle_key(ord("u"), NOW[0], 101325.0, 20.0, 50.0, 4.0)
        self.assertEqual(self.logger.events("STOP_VOID"), [])
        self.assertIn("nothing to undo", self.survey.message)

    def test_stop_message_names_next_station(self):
        self.select("2")
        self.survey.handle_key(ord("r"), NOW[0], 101325.0, 20.0, 50.0, 4.0)
        self.survey.handle_key(ord("k"), NOW[0], 101320.0, 20.0, 50.0, 4.0)
        self.assertIn("Senhor Roubado", self.survey.message)

    def test_end_session_stops_logging(self):
        self.select("2")
        self.survey.handle_key(ord("q"), NOW[0], 101325.0, 20.0, 50.0, 4.0)
        self.assertTrue(self.survey.ended)
        before = len(self.logger.rows)
        feed(self.survey, 5, 101325.0)
        self.assertEqual(len(self.logger.rows), before)

    def test_keys_after_session_end_are_ignored(self):
        self.select("2")
        self.survey.handle_key(ord("q"), NOW[0], 101325.0, 20.0, 50.0, 4.0)
        before = len(self.logger.rows)
        due = NOW[0]
        self.survey.handle_key(ord("s"), due, 101325.0, 20.0, 50.0, 4.0)
        self.assertIsNone(self.survey.window)
        self.assertIn("session closed", self.survey.message)
        feed(self.survey, 5, 101325.0)
        self.assertEqual(len(self.logger.rows), before)

    def test_csv_header_matches_row_width(self):
        import logger as logger_module

        columns = logger_module.CSV_HEADER.split(",")
        self.assertEqual(len(columns), 19)
        self.assertEqual(columns[11], "ref_entrance")


class LoggerRecoveryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        import logger as logger_module

        self.logger_module = logger_module
        self.saved = logger_module.SD_PATH
        logger_module.SD_PATH = self.tmp
        self.current = pathlib.Path(self.tmp) / "LX_CURRENT.csv"

    def tearDown(self):
        self.logger_module.SD_PATH = self.saved

    def write_current(self, rows):
        self.current.write_text(
            "session_id,seq,millis,record_type\n"
            + "".join(rows)
        )

    def test_interrupted_session_is_renamed_not_truncated(self):
        self.write_current(["LX_777,1,1000,sample\n", "LX_777,2,2000,sample\n"])
        logger = self.logger_module.Logger(log_line=lambda text: None)
        logger._recover_current()
        recovered = pathlib.Path(self.tmp) / "LX_777.csv"
        self.assertTrue(recovered.is_file())
        self.assertFalse(self.current.exists())
        self.assertIn("LX_777,2", recovered.read_text())

    def test_existing_target_gets_a_suffix(self):
        (pathlib.Path(self.tmp) / "LX_777.csv").write_text("older\n")
        self.write_current(["LX_777,1,1000,sample\n"])
        logger = self.logger_module.Logger(log_line=lambda text: None)
        logger._recover_current()
        self.assertTrue((pathlib.Path(self.tmp) / "LX_777_r1.csv").is_file())
        self.assertEqual(
            (pathlib.Path(self.tmp) / "LX_777.csv").read_text(), "older\n"
        )

    def test_header_only_file_is_removed(self):
        self.current.write_text("session_id,seq,millis,record_type\n")
        logger = self.logger_module.Logger(log_line=lambda text: None)
        logger._recover_current()
        self.assertFalse(self.current.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
