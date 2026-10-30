import math
import time

from config import (
    ANCHORS_NAME,
    EV_NOTE,
    EV_PLATFORM,
    EV_RIDE_END,
    EV_RIDE_START,
    EV_SESSION_END,
    EV_STATION_STOP,
    EV_SURFACE,
    IDLE_RATE_HZ,
    NOTE_TAG_TIMEOUT_MS,
    PLATFORM_WINDOW_S,
    PRESETS,
    RIDE_RATE_HZ,
    SD_PATH,
    STABILITY_WINDOW_MS,
    SURFACE_WINDOW_S,
    depth_m,
    event_for_key,
    key_char,
)


class Survey:
    def __init__(self, logger, log_line=lambda text: print(text)):
        self.logger = logger
        self.log_line = log_line
        self.message = ""
        self.preset = None
        self.surfaces = {}
        self.anchors_pressure = {}
        self.anchors_depth = {}
        self.ride = None
        self.window = None
        self.ring = []
        self.battery = None
        self.last_pressure = None
        self.live_depth = None
        self.note_pending = False
        self.note_pending_until = 0
        self._load_anchors()

    def _load_anchors(self):
        try:
            with open(SD_PATH + "/" + ANCHORS_NAME) as handle:
                for raw in handle.read().split("\n"):
                    parts = raw.strip().split(",")
                    if len(parts) != 3:
                        continue
                    line_code, station, depth_text = parts
                    try:
                        depth = float(depth_text)
                    except ValueError:
                        continue
                    if line_code and station:
                        self.anchors_depth[(line_code, station)] = depth
        except OSError:
            self.log_line("anchors file absent; starting empty")
            return

    def _save_anchors(self, line_code, station, depth):
        self.anchors_depth[(line_code, station)] = depth
        lines = ["line,station,depth_m"]
        for key in sorted(self.anchors_depth):
            value = self.anchors_depth[key]
            try:
                lines.append("{},{},{:.2f}".format(key[0], key[1], value))
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

    @property
    def rate_hz(self):
        return RIDE_RATE_HZ if self.ride else IDLE_RATE_HZ

    @property
    def mode(self):
        if self.ride:
            return "ride"
        if self.preset:
            return "station"
        return "idle"

    def _ctx_from_preset(self):
        preset = self.preset
        return {
            "line": preset["line"],
            "station": preset["station"],
            "platform": preset["platform"],
            "entrance": preset["entrance"],
            "direction": preset["direction"],
        }

    def _ctx_ride(self):
        ride = self.ride
        return {
            "line": ride["line"],
            "platform": ride["platform"],
            "direction": ride["direction"],
        }

    def _depth_event(self, ref_pressure, pressure_now):
        if ref_pressure is None or pressure_now is None:
            return None
        return depth_m(ref_pressure, pressure_now)

    def _stability(self):
        recent = [p for (ms, p) in self.ring]
        if len(recent) < 8:
            return None
        count = len(recent)
        mean = sum(recent) / count
        variance = sum((p - mean) ** 2 for p in recent) / count
        return math.sqrt(variance)

    def status(self):
        preset = self.preset
        avg_state = self.window if isinstance(self.window, dict) else None
        stability = self._stability()
        countdown = 0
        reference = None
        if self.ride:
            mode = "ride"
            label = self.ride["label"]
        elif self.preset:
            mode = "station"
            label = self.preset["label"]
        else:
            mode = "idle"
            label = "FIELD"
        if avg_state is not None:
            countdown = max(0, (avg_state["end_ms"] - time.ticks_ms()) // 1000)
            reference = avg_state["kind"]
        return {
            "mode": mode,
            "label": label,
            "rate_hz": self.rate_hz,
            "pressure": self.last_pressure,
            "depth": self.live_depth,
            "stability": stability,
            "window": reference,
            "countdown_s": countdown,
            "message": self.message,
            "battery": self.battery,
            "preset": preset,
            "surface": self.surfaces.get(self.preset["station"]) if self.preset else None,
            "anchor": (
                self.anchors_pressure.get((self.preset["line"], self.preset["station"]))
                if self.preset
                else None
            ),
        }

    def handle_key(self, code, now_ms, pressure, temp, humidity, battery):
        self.battery = battery
        event = event_for_key(code)
        ch = key_char(code)
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
        if ch is not None and "0" <= ch <= "9":
            index = int(ch)
            if 1 <= index <= len(PRESETS):
                if self.ride:
                    self.message = "preset during ride kept line"
                self.preset = PRESETS[index - 1]
                self.message = self.preset["label"]
                self.log_line("preset %s" % self.preset["label"])
            else:
                self.message = "preset 1-6 only"
            return
        if event == EV_SURFACE:
            self._start_surface_window(now_ms)
            return
        if event == EV_PLATFORM:
            self._start_platform_window(now_ms)
            return
        if event == EV_RIDE_START:
            self._toggle_ride(now_ms, pressure, temp, humidity, battery)
            return
        if event == EV_STATION_STOP:
            self._write_station_stop(now_ms, pressure, temp, humidity, battery)
            return
        if event == EV_NOTE:
            self.message = "note next key"
            self.note_pending = True
            self.note_pending_until = now_ms + NOTE_TAG_TIMEOUT_MS
            return
        if event == EV_SESSION_END:
            self._end_session(now_ms, battery)
            return
        self.message = "key %d unused" % code

    def _write_note(self, now_ms, pressure, temp, humidity, battery, tag):
        ctx = self._ctx()
        depth = self._depth_now()
        self.logger.write_event(
            now_ms,
            self.mode,
            ctx,
            EV_NOTE,
            pressure,
            temp,
            humidity,
            depth,
            battery,
            note=tag,
        )
        self.message = "note %s" % tag
        self.note_pending = False
        self.log_line("note %s" % tag)

    def _start_surface_window(self, now_ms):
        if not self.preset:
            self.message = "pick preset first"
            return
        self.window = {
            "kind": EV_SURFACE,
            "preset": self.preset,
            "end_ms": now_ms + SURFACE_WINDOW_S * 1000,
            "psum": 0.0,
            "tsum": 0.0,
            "hsum": 0.0,
            "count": 0,
        }
        self.message = "SURFACE %ds" % SURFACE_WINDOW_S
        self.log_line("surface window start")

    def _start_platform_window(self, now_ms):
        if not self.preset:
            self.message = "pick preset first"
            return
        self.window = {
            "kind": EV_PLATFORM,
            "preset": self.preset,
            "end_ms": now_ms + PLATFORM_WINDOW_S * 1000,
            "psum": 0.0,
            "tsum": 0.0,
            "hsum": 0.0,
            "count": 0,
        }
        self.message = "PLATFORM %ds" % PLATFORM_WINDOW_S
        self.log_line("platform window start")

    def mode_now(self):
        return self.mode

    def _ctx(self):
        if self.ride:
            return self._ctx_ride()
        if self.preset:
            return self._ctx_from_preset()
        return {}

    def _depth_now(self):
        if self.ride:
            ref = self.ride["ref_pa"]
            if ref is None or self.last_pressure is None:
                return None
            return depth_m(ref, self.last_pressure)
        return None

    def _toggle_ride(self, now_ms, pressure, temp, humidity, battery):
        preset = self.preset
        if self.ride is None:
            if not preset:
                self.message = "pick preset first"
                return
            ref = self.surfaces.get(preset["station"]) or self.anchors_pressure.get(
                (preset["line"], preset["station"])
            )
            self.ride = {
                "line": preset["line"],
                "platform": preset["platform"],
                "direction": preset["direction"],
                "label": preset["label"],
                "ref_pa": ref,
                "last_stop_station": preset["station"],
            }
            depth = self.anchors_depth.get((preset["line"], preset["station"]))
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
                note="" if ref else "no-ref",
            )
            self.message = "RIDE START"
            self.log_line("ride start rate %d" % RIDE_RATE_HZ)
        else:
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
                "ride end",
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
        if not self.preset:
            self.message = "pick preset first"
            return
        station = self.preset["station"]
        depth = self.anchors_depth.get((self.ride["line"], station))
        note = ""
        if depth is None:
            ref = self.ride["ref_pa"]
            if ref is not None and pressure is not None:
                depth = depth_m(ref, pressure)
                note = "raw-anchor"
        ctx = self.ride_ctx()
        ctx["station"] = station
        self.logger.write_event(
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
        self.last_station = station
        self.message = "STOP %s" % station

    def on_sample(self, now_ms, pressure, temp, humidity, battery):
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
        ctx = self._ctx()
        depth = None
        if self.ride:
            ref = self.ride["ref_pa"]
            if ref is not None:
                depth = depth_m(ref, pressure)
        elif self.preset:
            surf = self.surfaces.get(self.preset["station"])
            if surf is not None:
                depth = depth_m(surf, pressure)
        self.live_depth = depth
        self.logger.write_sample(
            now_ms, self.mode, ctx, pressure, temp, humidity, depth, battery
        )

    def _complete_window(self, now_ms, battery):
        preset = self.window["preset"]
        station = preset["station"]
        avg_p = self.window["psum"] / self.window["count"]
        avg_t = self.window["tsum"] / self.window["count"]
        avg_h = self.window["hsum"] / self.window["count"]
        kind = self.window["kind"]
        self.window = None
        if kind == EV_SURFACE:
            self.surfaces[station] = avg_p
            ctx = self._ctx_from_preset()
            self.logger.write_event(
                now_ms,
                "station",
                ctx,
                EV_SURFACE,
                avg_p,
                avg_t,
                avg_h,
                0.0,
                battery,
                note="avg %ds" % SURFACE_WINDOW_S,
            )
            self.message = "%s surface stored" % station
            self.log_line("surface %s %.2f Pa" % (station, avg_p))
            return
        surf = self.surfaces.get(station)
        if surf is None:
            self.message = "no surface for %s" % station
            self.log_line("platform refused: no surface for %s" % station)
            return
        depth = depth_m(surf, avg_p)
        ctx = self._ctx_from_preset()
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
            note="avg %ds" % PLATFORM_WINDOW_S,
        )
        self.anchors_pressure[(preset["line"], station)] = avg_p
        self._save_anchors(preset["line"], station, depth)
        self.message = "%s depth %.2f" % (station, depth)
        self.log_line("platform %s depth %.2f m" % (station, depth))

    def _end_session(self, now_ms, battery):
        final = self.logger.close_session(now_ms, battery)
        self.message = "session closed"
        self.log_line("session end key -> %s" % (final or "?"))
        self.window = None
        self.ride = None
        self.preset = None
        self.note_pending = False
