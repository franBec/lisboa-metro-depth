import math
import time

from config import (
    ANCHORS_NAME,
    BUILD_ID,
    DEFAULT_LINE,
    EV_CLOCK,
    EV_NOTE,
    EV_PLATFORM,
    EV_RIDE_END,
    EV_RIDE_START,
    EV_SESSION_END,
    EV_STATION_STOP,
    EV_STOP_VOID,
    EV_SURFACE,
    EV_TUNNEL_STOP,
    IDLE_RATE_HZ,
    KEY_DIRECTION,
    KEY_ENTRANCE,
    KEY_NEXT_STATION,
    KEY_PREV_STATION,
    MAX_ENTRANCES,
    NOTE_TAG_TIMEOUT_MS,
    PLATFORM_WINDOW_S,
    RIDE_RATE_HZ,
    SD_PATH,
    STABILITY_WINDOW_MS,
    SURFACE_WINDOW_S,
    depth_m,
    event_for_key,
    key_char,
)
from stations import LINES


class Survey:
    def __init__(self, logger, log_line=lambda text: print(text)):
        self.logger = logger
        self.log_line = log_line
        self.message = ""
        self.line_index = 0
        for index, line in enumerate(LINES):
            if line[0] == DEFAULT_LINE:
                self.line_index = index
        self.station_index = 0
        self.entrance = 1
        self.direction_flip = False
        self.active = False
        self.ended = False
        self.surfaces = {}
        self.surface_ms = {}
        self.anchors_pressure = {}
        self.anchors_depth = {}
        self.anchors_entrance = {}
        self.ride = None
        self.window = None
        self.ring = []
        self.battery = None
        self.last_pressure = None
        self.live_depth = None
        self.now_ms = 0
        self.note_pending = False
        self.note_pending_until = 0
        self.last_stop = None
        self._load_anchors()

    # -- context ---------------------------------------------------------
    @property
    def line(self):
        return LINES[self.line_index]

    @property
    def line_id(self):
        return self.line[0]

    @property
    def stations(self):
        return self.line[3]

    @property
    def station_id(self):
        return self.stations[self.station_index][0]

    @property
    def station_name(self):
        return self.stations[self.station_index][1]

    @property
    def platform(self):
        return self.line_id

    def direction_label(self):
        if self.direction_flip:
            return "to-" + self.stations[0][1]
        return "to-" + self.line[2]

    def _surface_key(self):
        return (self.line_id, self.station_id, self.entrance)

    def _surface_pressure(self):
        return self.surfaces.get(self._surface_key())

    def _latest_surface(self, line_id, station_id):
        best_key = None
        best_ms = None
        for key in self.surfaces:
            if key[0] != line_id or key[1] != station_id:
                continue
            stamp = self.surface_ms.get(key, 0)
            if best_ms is None or stamp > best_ms:
                best_ms = stamp
                best_key = key
        if best_key is None:
            return None, None
        return self.surfaces[best_key], best_key[2]

    def surface_age_s(self):
        key = self._surface_key()
        stamp = self.surface_ms.get(key)
        if stamp is None:
            return None
        return time.ticks_diff(self.now_ms, stamp) // 1000

    # -- anchors ---------------------------------------------------------
    def _load_anchors(self):
        try:
            with open(SD_PATH + "/" + ANCHORS_NAME) as handle:
                raw = handle.read()
        except OSError:
            self.log_line("anchors file absent; starting empty")
            return
        for raw_line in raw.split("\n"):
            parts = raw_line.strip().split(",")
            if len(parts) < 4:
                continue
            line_code, station, entrance, depth_text = parts[:4]
            try:
                depth = float(depth_text)
            except ValueError:
                continue
            if line_code and station:
                self.anchors_depth[(line_code, station)] = depth
                self.anchors_entrance[(line_code, station)] = entrance
        self.log_line("anchors loaded %d" % len(self.anchors_depth))

    def _save_anchors(self, line_code, station, entrance, depth):
        self.anchors_depth[(line_code, station)] = depth
        self.anchors_entrance[(line_code, station)] = entrance
        lines = ["line,station,entrance,depth_m"]
        for key in sorted(self.anchors_depth):
            value = self.anchors_depth[key]
            try:
                lines.append(
                    "{},{},{},{:.2f}".format(
                        key[0],
                        key[1],
                        self.anchors_entrance.get(key, ""),
                        value,
                    )
                )
            except (TypeError, ValueError):
                continue
        try:
            handle = open(SD_PATH + "/" + ANCHORS_NAME, "w")
            try:
                handle.write("\n".join(lines) + "\n")
                handle.flush()
                import os

                if hasattr(os, "sync"):
                    os.sync()
            finally:
                handle.close()
        except OSError as exc:
            self.log_line("anchors write failed: %r" % exc)

    # -- status ----------------------------------------------------------
    @property
    def rate_hz(self):
        return RIDE_RATE_HZ if self.ride else IDLE_RATE_HZ

    @property
    def mode(self):
        if self.ride:
            return "ride"
        if self.active:
            return "station"
        return "idle"

    def _stability(self):
        recent = [p for (ms, p) in self.ring]
        if len(recent) < 8:
            return None
        count = len(recent)
        mean = sum(recent) / count
        variance = sum((p - mean) ** 2 for p in recent) / count
        return math.sqrt(variance)

    def status(self):
        countdown = 0
        reference = None
        if self.window is not None:
            countdown = max(0, (self.window["end_ms"] - time.ticks_ms()) // 1000)
            reference = self.window["kind"]
        label = "%s %s" % (self.line_id, self.station_name)
        if self.ride:
            label = "RIDE %s" % self.line_id
        return {
            "mode": self.mode,
            "label": label,
            "line": self.line_id,
            "line_name": self.line[1],
            "station": self.station_name,
            "station_pos": "%d/%d" % (self.station_index + 1, len(self.stations)),
            "entrance": self.entrance,
            "rate_hz": self.rate_hz,
            "pressure": self.last_pressure,
            "depth": self.live_depth,
            "stability": self._stability(),
            "window": reference,
            "countdown_s": countdown,
            "message": self.message,
            "battery": self.battery,
            "surface_age_s": self.surface_age_s(),
            "ride_direction": self.direction_label() if self.ride else "",
            "ended": self.ended,
        }

    # -- keys ------------------------------------------------------------
    def handle_key(self, code, now_ms, pressure, temp, humidity, battery):
        self.now_ms = now_ms
        self.battery = battery
        ch = key_char(code)
        event = event_for_key(code)
        if self.ended:
            self.message = "session closed"
            return
        if self.note_pending and ch is not None and (event is None or ch == "n"):
            self.note_pending = False
            if time.ticks_diff(self.note_pending_until, now_ms) >= 0:
                self._write_note(now_ms, pressure, temp, humidity, battery, ch)
            else:
                self.message = "note timeout"
            return
        if self.window is not None:
            self.window = None
            self.message = "window cancelled"
            self.log_line("window cancelled by key %d" % code)
        if ch is not None and "1" <= ch <= "4":
            index = int(ch) - 1
            if index < len(LINES):
                self.line_index = index
                self.station_index = 0
                self.entrance = 1
                self.active = True
                self.message = "%s %s" % (self.line_id, self.line[1])
                self.log_line("line %s" % self.line_id)
            return
        if ch == KEY_NEXT_STATION:
            self.station_index = (self.station_index + 1) % len(self.stations)
            self.entrance = 1
            self.active = True
            self.message = self.station_name
            return
        if ch == KEY_PREV_STATION:
            self.station_index = (self.station_index - 1) % len(self.stations)
            self.entrance = 1
            self.active = True
            self.message = self.station_name
            return
        if ch == KEY_ENTRANCE:
            self.entrance = self.entrance % MAX_ENTRANCES + 1
            self.active = True
            self.message = "entrance %d" % self.entrance
            return
        if ch == KEY_DIRECTION:
            self.direction_flip = not self.direction_flip
            self.message = self.direction_label()
            return
        if event == EV_SURFACE:
            self._start_window(EV_SURFACE, now_ms, SURFACE_WINDOW_S)
            return
        if event == EV_PLATFORM:
            self._start_window(EV_PLATFORM, now_ms, PLATFORM_WINDOW_S)
            return
        if event == EV_RIDE_START:
            self._toggle_ride(now_ms, pressure, temp, humidity, battery)
            return
        if event == EV_STATION_STOP:
            self._write_station_stop(now_ms, pressure, temp, humidity, battery)
            return
        if event == EV_TUNNEL_STOP:
            self._write_tunnel_stop(now_ms, pressure, temp, humidity, battery)
            return
        if event == EV_STOP_VOID:
            self._undo_stop(now_ms, pressure, temp, humidity, battery)
            return
        if event == EV_NOTE:
            self.message = "note next key"
            self.note_pending = True
            self.note_pending_until = now_ms + NOTE_TAG_TIMEOUT_MS
            return
        if event == EV_CLOCK:
            self.message = "clock key handled by main"
            return
        if event == EV_SESSION_END:
            self._end_session(now_ms, battery)
            return
        self.message = "key %d unused" % code

    # -- notes and clock --------------------------------------------------
    def _write_note(self, now_ms, pressure, temp, humidity, battery, tag):
        self.logger.write_event(
            now_ms,
            self.mode,
            self._ctx(),
            EV_NOTE,
            pressure,
            temp,
            humidity,
            None,
            battery,
            note=tag,
        )
        self.message = "note %s" % tag
        self.note_pending = False
        self.log_line("note %s" % tag)

    def write_clock_event(self, now_ms, battery, note):
        self.logger.write_event(
            now_ms,
            self.mode,
            self._ctx(),
            EV_CLOCK,
            None,
            None,
            None,
            None,
            battery,
            note=note,
        )

    # -- windows ---------------------------------------------------------
    def _start_window(self, kind, now_ms, seconds):
        self.active = True
        self.window = {
            "kind": kind,
            "end_ms": now_ms + seconds * 1000,
            "seconds": seconds,
            "psum": 0.0,
            "tsum": 0.0,
            "hsum": 0.0,
            "count": 0,
        }
        self.message = "%s %ds" % (kind, seconds)
        self.log_line("%s window start" % kind)

    def _complete_window(self, now_ms, battery):
        kind = self.window["kind"]
        seconds = self.window["seconds"]
        avg_p = self.window["psum"] / self.window["count"]
        avg_t = self.window["tsum"] / self.window["count"]
        avg_h = self.window["hsum"] / self.window["count"]
        self.window = None
        if kind == EV_SURFACE:
            key = self._surface_key()
            self.surfaces[key] = avg_p
            self.surface_ms[key] = now_ms
            self.logger.write_event(
                now_ms,
                "station",
                self._ctx(),
                EV_SURFACE,
                avg_p,
                avg_t,
                avg_h,
                0.0,
                battery,
                note="avg %ds" % seconds,
            )
            self.message = "%s E%d surface" % (self.station_name, self.entrance)
            self.log_line(
                "surface %s E%d %.2f Pa" % (self.station_name, self.entrance, avg_p)
            )
            return
        ref = self._surface_pressure()
        ref_entrance = self.entrance
        note = "avg %ds" % seconds
        if ref is None:
            ref, ref_entrance = self._latest_surface(self.line_id, self.station_id)
            if ref is not None:
                note = "avg %ds; latest-entrance" % seconds
        depth = depth_m(ref, avg_p)
        if ref is None:
            note = "avg %ds; no-ref" % seconds
            self.message = "%s no surface" % self.station_name
            self.log_line("platform %s without surface" % self.station_name)
        else:
            self.message = "%s %+.2f m" % (self.station_name, depth)
            self.log_line(
                "platform %s E%d depth %+.2f m" % (self.station_name, ref_entrance, depth)
            )
        ctx = self._ctx()
        ctx["ref_entrance"] = str(ref_entrance) if ref is not None else ""
        self.logger.write_event(
            now_ms,
            "station",
            ctx,
            EV_PLATFORM,
            avg_p,
            avg_t,
            avg_h,
            depth,
            battery,
            note=note,
        )
        self.anchors_pressure[(self.line_id, self.station_id)] = avg_p
        if depth is not None:
            self._save_anchors(self.line_id, self.station_id, ref_entrance, depth)

    # -- ride ------------------------------------------------------------
    def _toggle_ride(self, now_ms, pressure, temp, humidity, battery):
        if self.ride is None:
            ref, ref_entrance = self._latest_surface(self.line_id, self.station_id)
            if ref is None:
                ref = self.anchors_pressure.get((self.line_id, self.station_id))
            self.ride = {
                "line": self.line_id,
                "platform": self.platform,
                "direction": self.direction_label(),
                "ref_pa": ref,
                "last_stop_station": self.station_id,
            }
            depth = self.anchors_depth.get((self.line_id, self.station_id))
            if depth is None and ref is not None and pressure is not None:
                depth = depth_m(ref, pressure)
            self.logger.write_event(
                now_ms,
                "ride",
                self.ride_ctx(),
                EV_RIDE_START,
                pressure,
                temp,
                humidity,
                depth,
                battery,
                note="" if ref is not None else "no-ref",
            )
            self.message = "RIDE START"
            self.log_line("ride start rate %d" % RIDE_RATE_HZ)
            return
        ride = self.ride
        depth = self.anchors_depth.get((ride["line"], ride["last_stop_station"]))
        if depth is None:
            ref = ride["ref_pa"]
            if ref is not None and pressure is not None:
                depth = depth_m(ref, pressure)
        self.logger.write_event(
            now_ms,
            "ride",
            self.ride_ctx(),
            EV_RIDE_END,
            pressure,
            temp,
            humidity,
            depth,
            battery,
            note="ride end",
        )
        self.ride = None
        self.message = "RIDE END"
        self.log_line("ride end rate %d" % IDLE_RATE_HZ)

    def ride_ctx(self):
        if not self.ride:
            return None
        ride = self.ride
        return {
            "line": ride["line"],
            "platform": ride["platform"],
            "direction": ride["direction"],
        }

    def _write_station_stop(self, now_ms, pressure, temp, humidity, battery):
        if not self.ride:
            self.message = "no ride"
            return
        station = self.station_id
        depth = self.anchors_depth.get((self.ride["line"], station))
        note = ""
        if depth is None:
            ref = self.ride["ref_pa"]
            if ref is not None and pressure is not None:
                depth = depth_m(ref, pressure)
                note = "raw-anchor"
        ctx = self.ride_ctx()
        ctx["station"] = station
        seq = self.logger.write_event(
            now_ms,
            "ride",
            ctx,
            EV_STATION_STOP,
            pressure,
            temp,
            humidity,
            depth,
            battery,
            note=note,
        )
        self.ride["last_stop_station"] = station
        self.last_stop = {
            "line": self.ride["line"],
            "station": station,
            "index": self.station_index,
            "seq": seq,
        }
        step = -1 if self.direction_flip else 1
        self.station_index = (self.station_index + step) % len(self.stations)
        self.message = "next: %s" % self.station_name

    def _write_tunnel_stop(self, now_ms, pressure, temp, humidity, battery):
        if not self.ride:
            self.message = "tunnel stop: no ride"
            return
        self.logger.write_event(
            now_ms,
            "ride",
            self.ride_ctx(),
            EV_TUNNEL_STOP,
            pressure,
            temp,
            humidity,
            None,
            battery,
            note="tunnel",
        )
        self.message = "TUNNEL_STOP"
        self.log_line("tunnel stop")

    def _undo_stop(self, now_ms, pressure, temp, humidity, battery):
        last = self.last_stop
        if last is None:
            self.message = "nothing to undo"
            return
        ctx = self.ride_ctx()
        if ctx is None:
            ctx = {"line": last["line"]}
        ctx["station"] = last["station"]
        self.logger.write_event(
            now_ms,
            self.mode,
            ctx,
            EV_STOP_VOID,
            pressure,
            temp,
            humidity,
            None,
            battery,
            note="void seq %s" % last["seq"],
        )
        self.station_index = last["index"]
        self.message = "void, back to %s" % self.station_name
        self.log_line("stop void seq %s" % last["seq"])
        self.last_stop = None

    # -- sampling --------------------------------------------------------
    def on_sample(self, now_ms, pressure, temp, humidity, battery):
        if self.ended:
            return
        self.now_ms = now_ms
        self.battery = battery
        self.last_pressure = pressure
        self.ring.append((now_ms, pressure))
        while self.ring and time.ticks_diff(now_ms, self.ring[0][0]) > STABILITY_WINDOW_MS:
            self.ring.pop(0)
        if self.window is not None:
            self.window["psum"] += pressure
            self.window["tsum"] += temp
            self.window["hsum"] += humidity
            self.window["count"] += 1
            if time.ticks_diff(now_ms, self.window["end_ms"]) >= 0:
                self._complete_window(now_ms, battery)
        depth = None
        if self.ride:
            ref = self.ride["ref_pa"]
            if ref is not None:
                depth = depth_m(ref, pressure)
        else:
            ref = self._surface_pressure()
            if ref is None:
                ref, _entrance = self._latest_surface(self.line_id, self.station_id)
            if ref is not None:
                depth = depth_m(ref, pressure)
        self.live_depth = depth
        self.logger.write_sample(
            now_ms, self.mode, self._ctx(), pressure, temp, humidity, depth, battery
        )

    def _ctx(self):
        if self.ride:
            return self.ride_ctx()
        if not self.active:
            return {}
        return {
            "line": self.line_id,
            "station": self.station_id,
            "platform": self.platform,
            "direction": self.direction_label(),
            "entrance": str(self.entrance),
        }

    def _end_session(self, now_ms, battery):
        final = self.logger.close_session(now_ms, battery)
        self.message = "session closed"
        self.log_line("session end key -> %s" % (final or "?"))
        self.window = None
        self.ride = None
        self.note_pending = False
        self.ended = True
