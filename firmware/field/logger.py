import os
import time

from config import (
    BUILD_ID,
    CURRENT_NAME,
    EV_SESSION_END,
    SESSION_PREFIX,
    SD_PATH,
    TIME_KNOWN_YEAR,
    sanitized_text,
)

CSV_HEADER = (
    "session_id,seq,timestamp_iso,millis,record_type,mode,line,station,"
    "platform,direction,entrance,ref_entrance,event,pressure_pa,temp_c,humidity,"
    "depth_m,battery_v,note"
)


def timestamp_iso():
    now = time.gmtime()
    if now[0] < TIME_KNOWN_YEAR:
        return ""
    return "%04d-%02d-%02dT%02d:%02d:%02dZ" % now[:6]


def f2(value):
    if value is None:
        return ""
    return "{:.2f}".format(value)


def session_name(now_ms):
    t = time.gmtime()
    if t[0] >= TIME_KNOWN_YEAR:
        return "%s_%04d%02d%02d_%02d%02d%02d" % (
            SESSION_PREFIX,
            t[0],
            t[1],
            t[2],
            t[3],
            t[4],
            t[5],
        )
    return "%s_%d" % (SESSION_PREFIX, now_ms)


class Logger:
    def __init__(self, log_line=lambda text: print(text)):
        self.log_line = log_line
        self.session_id = None
        self.session_seq = 0
        self.file = None
        self.path = None
        self.current_path = SD_PATH + "/" + CURRENT_NAME
        self.last_flush = 0
        self.free_warning_shown = False

    @property
    def is_open(self):
        return self.file is not None

    def _recover_current(self):
        """Preserve an interrupted LX_CURRENT.csv before the next session truncates it."""
        try:
            handle = open(self.current_path)
        except OSError:
            return
        try:
            handle.readline()
            first = handle.readline()
        finally:
            handle.close()
        session_id = first.split(",")[0].strip() if first else ""
        if not session_id:
            try:
                os.remove(self.current_path)
            except OSError:
                pass
            return
        target = SD_PATH + "/" + session_id + ".csv"
        attempt = 0
        while True:
            try:
                os.stat(target)
            except OSError:
                break
            attempt += 1
            target = SD_PATH + "/" + session_id + "_r%d.csv" % attempt
        try:
            os.rename(self.current_path, target)
            self.log_line("recovered %s" % target)
        except OSError as exc:
            self.log_line("recover failed: %r" % exc)

    def _ensure_open(self, now_ms):
        if self.file is not None:
            return True
        self._recover_current()
        self.session_id = session_name(now_ms)
        self.session_seq = 0
        self.path = SD_PATH + "/" + self.session_id + ".csv"
        try:
            self.file = open(self.current_path, "w")
        except OSError as exc:
            self.log_line("log open failed: %r" % exc)
            self.file = None
            self.session_id = None
            return False
        self.file.write(CSV_HEADER + "\n")
        self._flush()
        self._row(
            now_ms,
            "event",
            "idle",
            None,
            "SESSION_START",
            None,
            None,
            None,
            None,
            None,
            BUILD_ID,
        )
        self._flush()
        self.last_flush = now_ms
        free = self._free_mb()
        if free is not None and free < 100.0 and not self.free_warning_shown:
            self.free_warning_shown = True
            self.log_line("SD low: %.1f MB" % free)
        self.log_line("session open %s" % self.session_id)
        return True

    def _free_mb(self):
        try:
            stat = os.statvfs(SD_PATH)
            return stat[0] * stat[4] / 1048576.0
        except Exception:
            return None

    def _flush(self):
        if self.file is None:
            return
        try:
            self.file.flush()
        except OSError as exc:
            self.log_line("flush failed: %r" % exc)
            self.file = None
            self.session_id = None

    def tick(self, now_ms):
        if self.file is None:
            return
        if time.ticks_diff(now_ms, self.last_flush) >= 10000:
            self._flush()
            self.last_flush = now_ms

    def _row(
        self,
        now_ms,
        record_type,
        mode,
        ctx,
        event,
        pressure,
        temp,
        humidity,
        depth,
        battery,
        note,
    ):
        if not self._ensure_open(now_ms):
            return None
        ctx = ctx or {}
        self.session_seq += 1
        parts = (
            self.session_id,
            str(self.session_seq),
            timestamp_iso(),
            str(now_ms),
            record_type,
            mode,
            sanitized_text(ctx.get("line")),
            sanitized_text(ctx.get("station")),
            sanitized_text(ctx.get("platform")),
            sanitized_text(ctx.get("direction")),
            sanitized_text(ctx.get("entrance")),
            sanitized_text(ctx.get("ref_entrance")),
            sanitized_text(event),
            f2(pressure),
            f2(temp),
            f2(humidity),
            f2(depth),
            f2(battery),
            sanitized_text(note),
        )
        text = ",".join(parts) + "\n"
        try:
            self.file.write(text)
        except OSError as exc:
            self.log_line("write failed: %r" % exc)
            self.file = None
            self.session_id = None
            return None
        self.last_flush = now_ms
        return self.session_seq

    def write_sample(self, now_ms, mode, ctx, pressure, temp, humidity, depth, battery):
        self._row(now_ms, "sample", mode, ctx, "", pressure, temp, humidity, depth, battery, "")
        if self.session_seq % 16 == 0:
            self._flush()

    def write_event(
        self,
        now_ms,
        mode,
        ctx,
        event,
        pressure,
        temp,
        humidity,
        depth,
        battery,
        note="",
    ):
        seq = self._row(
            now_ms,
            "event",
            mode,
            ctx,
            event,
            pressure,
            temp,
            humidity,
            depth,
            battery,
            note,
        )
        self._flush()
        return seq

    def close_session(self, now_ms, battery=None):
        if self.file is None:
            return None
        try:
            self._row(now_ms, "event", "idle", None, EV_SESSION_END, None, None, None, None, battery, "")
        except OSError as exc:
            self.log_line("end row failed: %r" % exc)
        self._flush()
        try:
            self.file.close()
        except OSError:
            pass
        self.file = None
        final = self.path
        try:
            os.rename(self.current_path, final)
        except OSError as exc:
            self.log_line("rename failed: %r" % exc)
            final = self.current_path
        self.log_line("session closed -> %s" % final)
        self.session_id = None
        self.path = final
        return final
