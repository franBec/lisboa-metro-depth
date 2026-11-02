from config import COLOR_BG, COLOR_FG, COLOR_RED


def _right(disp, text, y):
    disp.drawRightString(text, 237, y)


def draw_dashboard(disp, status, extra_text):
    pressure = status["pressure"]
    depth = status["depth"]
    battery = status["battery"]
    stability = status["stability"]
    label = status["label"][:28]

    disp.fillScreen(COLOR_BG)
    if status["mode"] == "ride":
        disp.fillRect(0, 0, 4, 135, COLOR_RED)

    disp.setTextColor(COLOR_FG, COLOR_BG)
    disp.drawString(label, 8, 2)
    _right(disp, "%s %dHz" % (status["mode"].upper(), status["rate_hz"]), 2)

    disp.drawString("%.1f Pa" % pressure if pressure is not None else "P --", 8, 18)
    disp.setTextColor(COLOR_RED if (depth is not None and depth < -0.05) else COLOR_FG, COLOR_BG)
    disp.drawString("%+.2f m" % depth if depth is not None else "z --", 150, 18)
    disp.setTextColor(COLOR_FG, COLOR_BG)

    disp.drawString("%.2f V" % battery if battery is not None else "V --", 8, 34)
    if status["window"] is not None:
        window = "%s %3ds" % (status["window"], status["countdown_s"])
    else:
        window = "st %s" % (
            "ok" if (stability is not None and stability < 5.0) else "--"
        )
    disp.drawString(window, 90, 34)
    _right(disp, status["station_pos"], 34)

    age = status["surface_age_s"]
    disp.drawString(
        "E%d srf %s" % (status["entrance"], ("%ds" % age) if age is not None else "--"),
        8,
        50,
    )
    _right(disp, extra_text, 50)

    message = status["message"][:30] if status["message"] else "ready"
    disp.drawString(message, 8, 66)

    if status["ride_direction"]:
        disp.drawString(status["ride_direction"][:30], 8, 82)

    disp.drawString("1-4 ln ,. st e ent s p r k t u n w q", 2, 118)
