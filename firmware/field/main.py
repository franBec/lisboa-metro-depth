import os
import sys
import time

import machine
import M5

for _path in ("/flash/apps/field",):
    if _path not in sys.path:
        sys.path.insert(0, _path)

from bme280 import BME280
from config import (
    BME280_ADDRESSES,
    BUILD_ID,
    COLOR_BG,
    COLOR_FG,
    EV_CLOCK,
    I2C_FREQ,
    I2C_SCL_PIN,
    I2C_SDA_PIN,
    SD_CS_PIN,
    SD_MISO_PIN,
    SD_MOSI_PIN,
    SD_PATH,
    SD_SCK_PIN,
    SD_SLOT,
    UI_PERIOD_MS,
    event_for_key,
)
from logger import Logger
from survey import Survey
import timebase
import ui


def log_line(text):
    print(text)


def ensure_sd():
    try:
        os.listdir(SD_PATH)
        return True
    except OSError:
        pass
    try:
        sd = machine.SDCard(
            slot=SD_SLOT,
            sck=machine.Pin(SD_SCK_PIN),
            mosi=machine.Pin(SD_MOSI_PIN),
            miso=machine.Pin(SD_MISO_PIN),
            cs=machine.Pin(SD_CS_PIN),
        )
        os.mount(sd, SD_PATH)
        log_line("SD mounted")
        return True
    except Exception as exc:
        log_line("SD mount failed: %r" % exc)
        return False


def battery_voltage():
    try:
        return M5.Power.getBatteryVoltage() / 1000.0
    except Exception:
        return None


def init_sensor():
    i2c = machine.I2C(
        0,
        scl=machine.Pin(I2C_SCL_PIN),
        sda=machine.Pin(I2C_SDA_PIN),
        freq=I2C_FREQ,
    )
    found = i2c.scan()
    log_line("I2C: %s" % [hex(address) for address in found])
    address = None
    for candidate in BME280_ADDRESSES:
        if candidate in found:
            address = candidate
            break
    if address is None:
        raise RuntimeError("BME280 not found on I2C")
    chip_id = i2c.readfrom_mem(address, 0xD0, 1)[0]
    log_line("BME280 0x%02x id 0x%02x" % (address, chip_id))
    return BME280(i2c=i2c, address=address)


def error_screen(disp, message):
    disp.fillScreen(COLOR_BG)
    disp.setTextColor(0xF800, COLOR_BG)
    disp.drawString("FIELD error", 4, 4)
    disp.drawString(message[:28], 4, 40)


def main():
    M5.begin()
    disp = M5.Display
    log_line("FIELD boot %s" % BUILD_ID)

    if not ensure_sd():
        error_screen(disp, "SD mount failed")
        return 1

    try:
        sensor = init_sensor()
    except Exception as exc:
        error_screen(disp, str(exc)[:28])
        return 1

    from hardware import MatrixKeyboard

    keyboard = MatrixKeyboard()
    logger = Logger(log_line=log_line)
    survey = Survey(logger, log_line=log_line)
    logger.log_line("FIELD ready")

    period_ms = 1000 // survey.rate_hz
    next_tick = time.ticks_ms()
    last_ui = 0

    disp.fillScreen(COLOR_BG)
    disp.setTextColor(COLOR_FG, COLOR_BG)
    disp.drawString("FIELD", 4, 4)
    disp.drawString(BUILD_ID, 4, 22)

    try:
        while True:
            now = time.ticks_ms()
            M5.update()
            keyboard.tick()
            if survey.rate_hz != 1000 // period_ms:
                period_ms = 1000 // survey.rate_hz
                next_tick = now
            if not survey.ended and time.ticks_diff(now, next_tick) >= 0:
                try:
                    temp, pressure, humidity = sensor.read_compensated_data()
                except Exception as exc:
                    log_line("sensor read failed: %r" % exc)
                    pressure = temp = humidity = None
                battery = battery_voltage()
                if pressure is not None:
                    survey.on_sample(now, pressure, temp, humidity, battery)
                    next_tick = time.ticks_add(next_tick, period_ms)
                    if time.ticks_diff(now, next_tick) > 0:
                        next_tick = time.ticks_add(now, period_ms)
            key = keyboard.get_key()
            if key is not None:
                try:
                    temp_k, press_k, hum_k = sensor.read_compensated_data()
                except Exception:
                    temp_k = press_k = hum_k = None
                battery_k = battery_voltage()
                if press_k is not None:
                    if event_for_key(key) == EV_CLOCK:
                        note = timebase.sync(log_line)
                        survey.message = note
                        survey.write_clock_event(time.ticks_ms(), battery_k, note)
                        log_line(note)
                    else:
                        survey.handle_key(
                            key, now, press_k, temp_k, hum_k, battery_k
                        )
            logger.tick(now)
            if time.ticks_diff(now, last_ui) >= UI_PERIOD_MS:
                last_ui = now
                status = survey.status()
                extra = "SD %s" % ("ok" if logger.file else "-")
                try:
                    ui.draw_dashboard(disp, status, extra)
                except OSError:
                    pass
            time.sleep_ms(5)
    except KeyboardInterrupt:
        log_line("FIELD stopped by Ctrl-C")
        logger.tick(time.ticks_ms())
    except Exception as exc:
        log_line("FIELD crash: %r" % exc)
        error_screen(disp, str(exc)[:28])
    return 0


main()
