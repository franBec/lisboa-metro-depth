import os
import sys
import time
import machine
import M5

for _path in ("/flash/apps/bench", "/bench"):
    if _path not in sys.path:
        sys.path.append(_path)

from bme280 import BME280

SD_PATH = "/sd"
RATE_HZ = 8
DEFAULT_SECONDS = 600
CSV_HEADER = (
    "session_id,seq,timestamp_iso,millis,record_type,mode,line,station,"
    "platform,direction,entrance,event,pressure_pa,temp_c,humidity,"
    "depth_m,battery_v,note"
)

def ticks():
    return time.ticks_ms()


def timestamp_iso():
    now = time.gmtime()
    if now[0] < 2024:
        return ""
    return "%04d-%02d-%02dT%02d:%02d:%02dZ" % now[:6]


def f2(value):
    if value is None:
        return ""
    return "{:.2f}".format(value)


def ensure_sd():
    try:
        os.listdir(SD_PATH)
        return True
    except OSError:
        pass
    try:
        sd = machine.SDCard(
            slot=3,
            sck=machine.Pin(40),
            mosi=machine.Pin(14),
            miso=machine.Pin(39),
            cs=machine.Pin(12),
        )
        os.mount(sd, SD_PATH)
        print("Mounted SD at", SD_PATH)
        return True
    except Exception as exc:
        print("SD mount failed:", exc)
        return False


def free_space_mb():
    try:
        stat = os.statvfs(SD_PATH)
        return stat[0] * stat[4] / 1048576.0
    except Exception:
        return None


def battery_voltage():
    try:
        return M5.Power.getBatteryVoltage() / 1000.0
    except Exception as exc:
        print("battery read failed:", exc)
        return None


def row(session, seq, millis, record_type, event, pressure, temp, humidity, battery, note):
    return ",".join(
        (
            session,
            str(seq),
            timestamp_iso(),
            str(millis),
            record_type,
            "calibration",
            "",
            "",
            "",
            "",
            "",
            event,
            f2(pressure),
            f2(temp),
            f2(humidity),
            "",
            f2(battery),
            note,
        )
    ) + "\n"


def init_sensor():
    i2c = machine.I2C(0, scl=machine.Pin(1), sda=machine.Pin(2), freq=100000)
    found = i2c.scan()
    print("I2C scan:", [hex(address) for address in found])
    address = None
    for candidate in (0x76, 0x77):
        if candidate in found:
            address = candidate
            break
    if address is None:
        raise RuntimeError("BME280 not found on Grove I2C bus")
    chip_id = i2c.readfrom_mem(address, 0xD0, 1)[0]
    print("BME280 address 0x%02x chip id 0x%02x" % (address, chip_id))
    return BME280(i2c=i2c, address=address)


def main(seconds=None):
    if seconds is None:
        try:
            seconds = int(sys.argv[1])
        except (AttributeError, IndexError, ValueError):
            seconds = DEFAULT_SECONDS

    print("UIFlow2 bench: %d s at %d Hz" % (seconds, RATE_HZ))
    if not ensure_sd():
        return 1
    free = free_space_mb()
    if free is not None:
        print("SD free: %.1f MB" % free)

    sensor = init_sensor()
    temp, pressure, humidity = sensor.read_compensated_data()
    print("Initial: %.2f Pa %.2f C %.2f %%" % (pressure, temp, humidity))

    session = "BENCH_%d" % ticks()
    path = SD_PATH + "/" + session + ".csv"
    period_ms = 1000 // RATE_HZ
    temporary = SD_PATH + "/BENCH_CURRENT.csv"

    sample_count = 0
    missed = 0
    p_min = p_max = pressure
    t_min = t_max = temp
    h_min = h_max = humidity
    battery_start = battery_voltage()

    log = open(temporary, "w")
    log.write(CSV_HEADER + "\n")
    log.write(row(session, 0, ticks(), "event", "BENCH_START", None, None, None, battery_start, "bench start"))
    seq = 1
    log.flush()

    start = ticks()
    next_tick = start
    last_flush = start

    try:
        while time.ticks_diff(ticks(), start) < seconds * 1000:
            now = ticks()
            if time.ticks_diff(now, next_tick) >= 0:
                temp, pressure, humidity = sensor.read_compensated_data()
                battery = battery_voltage()
                log.write(row(session, seq, now, "sample", "", pressure, temp, humidity, battery, "bench"))
                seq += 1
                sample_count += 1
                p_min = min(p_min, pressure)
                p_max = max(p_max, pressure)
                t_min = min(t_min, temp)
                t_max = max(t_max, temp)
                h_min = min(h_min, humidity)
                h_max = max(h_max, humidity)

                next_tick = time.ticks_add(next_tick, period_ms)
                after = ticks()
                if time.ticks_diff(after, next_tick) > period_ms:
                    missed += 1
                    next_tick = time.ticks_add(after, period_ms)

                if time.ticks_diff(after, last_flush) >= 10000:
                    log.flush()
                    if hasattr(os, "sync"):
                        os.sync()
                    last_flush = after
                    print("samples=%d p=%.2f Pa batt=%.2f V" % (sample_count, pressure, battery or 0.0))
            else:
                time.sleep_ms(1)
    finally:
        battery_end = battery_voltage()
        log.write(row(session, seq, ticks(), "event", "BENCH_END", None, None, None, battery_end, "bench end"))
        log.flush()
        if hasattr(os, "sync"):
            os.sync()
        log.close()
        try:
            os.rename(temporary, path)
        except OSError:
            path = temporary

    print("File:", path)
    print("Samples:", sample_count, "Missed deadlines:", missed)
    print("Pressure: %.2f .. %.2f Pa" % (p_min, p_max))
    print("Temperature: %.2f .. %.2f C" % (t_min, t_max))
    print("Humidity: %.2f .. %.2f %%" % (h_min, h_max))
    print("Battery: %.2f .. %.2f V" % (battery_start or 0.0, battery_end or 0.0))
    return 0


if __name__ == "__main__":
    main()
