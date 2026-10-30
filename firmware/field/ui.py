from config import COLOR_BG, COLOR_FG


def draw_dashboard(disp, status, extra_text):
    pres = status["pressure"]
    depth = status["depth"]
    battery = status["battery"]
    stability = status["stability"]
    label = status["label"][:16]
    mode_text = "%s %dHz" % (status["mode"].upper(), status["rate_hz"])

    disp.fillScreen(COLOR_BG)
    bar = status["bar"]
    if bar:
        disp.fillRect(0, 0, 4, 135, bar)

    disp.setTextColor(COLOR_FG, COLOR_BG)
    disp.drawString(label, 8, 2)
    disp.drawString(mode_text, 150, 2)

    disp.drawString("%.1f Pa" % pres if pres is not None else "P --", 8, 18)
    disp.drawString(
        "%+.2f m" % depth if depth is not None else "z --",
        130,
        18,
    )
    disp.drawString("%.2f V" % battery if battery is not None else "V --", 8, 34)

    if status["window"] is not None:
        window = "%s %3ds" % (status["window"], status["countdown_s"])
    else:
        window = "st %s" % (
            "ok" if (stability is not None and stability < 5.0) else "--"
        )
    disp.drawString(window, 100, 34)

    disp.drawString(
        "srf %s anc %s" % (
            "y" if status["surface"] else "-",
            "y" if status["anchor"] else "-",
        ),
        8,
        50,
    )
    disp.drawString(extra_text, 120, 50)

    message = status["message"][:16] if status["message"] else "ready"
    disp.drawString(message, 8, 66)

    disp.drawString("1-6 preset S P R K N Q q=close", 2, 118)
