"""Wall-clock sync over the phone hotspot.

Credentials live on the SD card so the repository never carries them:

    /sd/wifi.txt
    <ssid>
    <password>

Sync is best effort. Without it the logger still works: rows carry millis and
`timestamp_iso` stays empty, exactly as in the pilot.
"""

import time

from config import NTP_TIMEOUT_MS, SD_PATH, WIFI_NAME


def _read_credentials():
    with open(SD_PATH + "/" + WIFI_NAME) as handle:
        lines = handle.read().strip().split("\n")
    if not lines or not lines[0].strip():
        raise OSError("empty wifi file")
    password = lines[1].strip() if len(lines) > 1 else ""
    return lines[0].strip(), password


def sync(log_line=lambda text: print(text)):
    try:
        import network
        import ntptime
    except ImportError as exc:
        return "no wifi stack"
    try:
        ssid, password = _read_credentials()
    except OSError:
        return "no /sd/wifi.txt"
    station = None
    try:
        station = network.WLAN(network.STA_IF)
        station.active(True)
        station.connect(ssid, password)
        started = time.ticks_ms()
        while not station.isconnected():
            if time.ticks_diff(time.ticks_ms(), started) > NTP_TIMEOUT_MS:
                return "wifi timeout"
            time.sleep_ms(100)
        ntptime.settime()
        stamp = time.gmtime()
        return "clock %04d-%02d-%02d %02d:%02d:%02dZ" % stamp[:6]
    except Exception as exc:
        return "ntp failed %r" % (exc,)
    finally:
        if station is not None:
            try:
                station.active(False)
            except Exception:
                pass
