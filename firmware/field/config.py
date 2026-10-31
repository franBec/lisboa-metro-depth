import math

I2C_SCL_PIN = 1
I2C_SDA_PIN = 2
I2C_FREQ = 100000
BME280_ADDRESSES = (0x76, 0x77)

SD_SLOT = 3
SD_SCK_PIN = 40
SD_MOSI_PIN = 14
SD_MISO_PIN = 39
SD_CS_PIN = 12
SD_PATH = "/sd"
CURRENT_NAME = "LX_CURRENT.csv"
ANCHORS_NAME = "anchors.csv"
SESSION_PREFIX = "LX"
FREE_SPACE_WARN_MB = 100.0

TIME_KNOWN_YEAR = 2024

IDLE_RATE_HZ = 1
RIDE_RATE_HZ = 8

SURFACE_WINDOW_S = 60
PLATFORM_WINDOW_S = 45
STABILITY_WINDOW_MS = 10000
STABILITY_THRESHOLD_PA = 5.0
NOTE_TAG_TIMEOUT_MS = 15000

FLUSH_INTERVAL_MS = 10000
UI_PERIOD_MS = 200

COLOR_GREEN = 0x07E0
COLOR_RED = 0xF800
COLOR_FG = 0xFFFF
COLOR_BG = 0x0000

DIRECTION_C = "to-areeiro"
DIRECTION_D = "to-saldanha"

PRESETS = (
    {
        "key": "1",
        "label": "Green Areeiro",
        "color": COLOR_GREEN,
        "line": "C",
        "platform": "C",
        "station": "Areeiro",
        "entrance": "AE-1",
        "direction": DIRECTION_C,
    },
    {
        "key": "2",
        "label": "Green Alameda",
        "color": COLOR_GREEN,
        "line": "C",
        "platform": "C",
        "station": "Alameda",
        "entrance": "AL-1",
        "direction": DIRECTION_C,
    },
    {
        "key": "3",
        "label": "Green Arroios",
        "color": COLOR_GREEN,
        "line": "C",
        "platform": "C",
        "station": "Arroios",
        "entrance": "AR-1",
        "direction": DIRECTION_C,
    },
    {
        "key": "4",
        "label": "Red Saldanha",
        "color": COLOR_RED,
        "line": "D",
        "platform": "D",
        "station": "Saldanha",
        "entrance": "SA-1",
        "direction": DIRECTION_D,
    },
    {
        "key": "5",
        "label": "Red Alameda",
        "color": COLOR_RED,
        "line": "D",
        "platform": "D",
        "station": "Alameda",
        "entrance": "AL-1",
        "direction": DIRECTION_D,
    },
    {
        "key": "6",
        "label": "Red Olaias",
        "color": COLOR_RED,
        "line": "D",
        "platform": "D",
        "station": "Olaias",
        "entrance": "OL-1",
        "direction": DIRECTION_D,
    },
)

EV_SURFACE = "SURFACE"
EV_PLATFORM = "PLATFORM"
EV_RIDE_START = "RIDE_START"
EV_RIDE_END = "RIDE_END"
EV_STATION_STOP = "STATION_STOP"
EV_NOTE = "NOTE"
EV_SESSION_END = "SESSION_END"

KEY_DIGIT_BASE = 0x30

KEY_EVENTS = {
    "s": EV_SURFACE,
    "p": EV_PLATFORM,
    "r": EV_RIDE_START,
    "k": EV_STATION_STOP,
    "n": EV_NOTE,
    "q": EV_SESSION_END,
}


def key_char(code):
    if 32 <= code < 127:
        return chr(code).lower()
    return None


def digit_index(code):
    return code - KEY_DIGIT_BASE


def event_for_key(code):
    ch = key_char(code)
    if ch is None:
        return None
    return KEY_EVENTS.get(ch)


def sanitized_text(text, max_len=60):
    if text is None:
        return ""
    return (
        str(text)
        .replace('"', "'")
        .replace(",", ";")
        .replace("\r", " ")
        .replace("\n", " ")
        .strip()[:max_len]
    )


def depth_m(p_ref, p_now):
    if p_ref is None or p_now is None:
        return None
    if p_now <= 0 or p_ref <= 0:
        return None
    return 8434.0 * math.log(p_now / p_ref)
