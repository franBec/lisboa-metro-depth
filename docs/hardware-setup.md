# Hardware setup and bench log

Status: Cardputer + Grove BME280 + 32 GB microSD. UIFlow2 2.5.3 flashed. Core bench tests passed on 2026-10-29.

> **Note:** This setup was performed on Linux (NixOS 25.11, kernel 6.12.81, x86_64). The commands use Linux device paths such as `/dev/ttyACM0`. Adapt them for macOS or Windows.

This document records the setup steps actually used. It is not the final survey firmware procedure.

## Parts

| Part | Notes |
|---|---|
| M5Stack Cardputer | ESP32-S3, 8 MB flash, 56-key keyboard, Grove port, microSD slot |
| Seeed Grove BME280 | Temperature, humidity, pressure; I2C |
| Grove cable, 5 cm | Bench connection |
| Grove cable, 20 cm | Reserved for field rides |
| SanDisk Ultra 32 GB microSDHC | FAT32 |
| Logilink CR0039 USB-C microSD reader | Used for PC-side checks and log retrieval |

## Safety

- Switch the Cardputer `OFF` before connecting or disconnecting the Grove cable or microSD.
- Do not force Grove connectors. They are keyed.
- Hold the BME280 by its PCB edges. Do not cover the pressure port.
- Keep the stock firmware backup. Do not delete it.
- Do not commit firmware binaries to git. Commit measurement logs only through `data/measurements/` and its index.

## Host setup

Your user must be able to open the USB serial port. On most Linux distributions, add your user to the group that owns `/dev/ttyACM*`, usually `dialout`:

```bash
sudo usermod -aG dialout "$USER"
```

Log out and back in, then verify:

```bash
id -nG
ls -l /dev/ttyACM0
```

Expected: `dialout` in the group list, and `crw-rw---- root dialout` for the port.

Alternatively, add a udev rule for the Espressif USB vendor ID (`303a`) in `/etc/udev/rules.d/99-esp32-serial.rules`:

```text
SUBSYSTEM=="tty", KERNEL=="ttyACM*", ATTRS{idVendor}=="303a", MODE="0660", GROUP="dialout", TAG+="uaccess"
```

Reload the rules and re-plug the device:

```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
```

On macOS, install the Espressif USB driver if needed and use `/dev/cu.usbmodem*`. On Windows, install the Espressif USB-JTAG driver and use the COM port shown in Device Manager.

Install the tools with pip, pipx, or your package manager:

```bash
python3 -m pip install --user esptool mpremote
```

If your distribution blocks system pip installs, use a virtual environment or pipx instead. On NixOS, `nix shell nixpkgs#esptool nixpkgs#mpremote` also works.

Versions used: `esptool 5.1.0`, `mpremote 1.25.0`. A temporary Python virtual environment with `mpremote 1.29.0` was also used for diagnostics; it gave the same result.

## 1. Unbox and stock smoke test

1. Check all parts and connectors for visible damage.
2. Insert the microSD into the Cardputer with the power off.
3. Charge with the side switch `ON` until the battery is full.
4. Power on and confirm:
   - display is readable, with no flicker or dead regions
   - keyboard letters and numbers work
   - `Shift`, `Space`, `Backspace`, and `Enter` work
   - `Fn` + `;`, `Fn` + `.`, `Fn` + `,`, `Fn` + `/` act as arrow keys
   - keyboard wake works: a single key is ignored while asleep, then `Fn` + key registers
5. Screen sleep could not be set in the stock firmware. It was deferred to UIFlow2.

## 2. USB and chip check

The Cardputer enumerates as Espressif `303a:1001` in stock/download mode and as `303a:81da` under UIFlow2.

```bash
lsusb | grep -i 303a
ls -l /dev/ttyACM0
ls -l /dev/serial/by-id/
```

A stable by-id path appeared under `/dev/serial/by-id/` for the UIFlow2 device.

Chip check:

```bash
esptool --chip esp32s3 --port /dev/ttyACM0 flash-id
```

Observed:

- ESP32-S3 rev v0.2
- 8 MB flash
- 8 MB detected flash size
- USB mode: USB-Serial/JTAG
- MAC: `48:ca:43:b5:da:80`

## 3. Back up the stock firmware

Enter download mode:

1. Unplug USB.
2. Switch `OFF`.
3. Hold `G0`.
4. Plug USB-C.
5. Release `G0`.

Back up:

```bash
mkdir -p ~/backups/cardputer
esptool --chip esp32s3 --port /dev/ttyACM0 --baud 921600 \
  read-flash 0x0 0x800000 \
  ~/backups/cardputer/cardputer-stock-8mb.bin
```

Expected size: `8,388,608` bytes.

Record the SHA256:

```bash
sha256sum ~/backups/cardputer/cardputer-stock-8mb.bin
```

Observed hash for the setup unit. Your unit has its own stock image and will produce a different hash:

```text
8e43ab75fe449feb515408c35a83be8e892319290a54cdc72fa9797b642098ee
```

Verify against the device before erasing:

```bash
esptool --chip esp32s3 --port /dev/ttyACM0 --baud 921600 \
  verify-flash 0x0 \
  ~/backups/cardputer/cardputer-stock-8mb.bin
```

Do not erase until the size, hash, and verification pass.

## 4. Flash UIFlow2 2.5.3

Download:

```bash
curl -L -o ~/Downloads/uiflow-cardputer-2.5.3.bin \
  https://github.com/m5stack/uiflow-micropython/releases/download/2.5.3/uiflow-50e4407-esp32s3-8mb-cardputer-v2.5.3-20260911.bin
```

Expected SHA256:

```text
8c51394d129c940ce887ae7b14dff3d3eed7608e342567acc8c34df3170ae6b0
```

Enter download mode again, then:

```bash
esptool --chip esp32s3 --port /dev/ttyACM0 erase-flash
esptool --chip esp32s3 --port /dev/ttyACM0 --baud 921600 \
  write-flash 0x0 ~/Downloads/uiflow-cardputer-2.5.3.bin
```

If `921600` is unstable, retry with `--baud 460800`.

Observed result:

- write at `0x0`
- 8,384,512 bytes written
- data hash verified by esptool
- UIFlow2 banner: `V2.5.3`
- MicroPython: `v1.27.0-dirty`
- Board string: `M5STACK Cardputer with ESP32-S3-FN8`

## 5. UIFlow2 connection notes

`mpremote` raw REPL does not work with UIFlow2 2.5.3. `mpremote exec`, `fs`, and `run` fail with:

```text
mpremote.transport.TransportError: could not enter raw repl
```

This was tested with mpremote 1.25.0 and 1.29.0.

Working paths:

- UIFlow2 WebTerminal at `https://uiflow2.m5stack.com/`
- normal MicroPython REPL over `/dev/ttyACM0`

The WebTerminal also showed that interrupting the startup app produces a `KeyboardInterrupt` traceback. That is expected; it is not a firmware failure.

Long raw serial sessions while the startup app is interrupted can make the UIFlow2 USB device disappear. For uploads, prefer the WebTerminal file manager. After a USB drop, power-cycle the Cardputer.

## 6. Grove BME280

Connection:

- 5 cm Grove cable
- Cardputer Grove port: black `GND`, red `5V`, yellow `G2` (SDA), white `G1` (SCL)
- BME280 module on the other end

Detection:

```python
from machine import I2C, Pin

i2c = I2C(0, scl=Pin(1), sda=Pin(2), freq=100000)
print([hex(address) for address in i2c.scan()])
print(hex(i2c.readfrom_mem(0x76, 0xD0, 1)[0]))
```

Observed:

```text
['0x76']
0x60
```

The pressure reading at rest was about `100,996 Pa`, consistent with local weather.

## 7. microSD

Check the card on the PC first:

```bash
lsblk -o NAME,SIZE,FSTYPE,LABEL,MOUNTPOINTS
```

Observed: 29.7 GB vfat, empty, 32 MB random write/read hash matched after unmount/remount.

UIFlow2 2.5.3 does not auto-mount the card. Mount it manually:

```python
import machine
import os

sd = machine.SDCard(
    slot=3,
    sck=machine.Pin(40),
    mosi=machine.Pin(14),
    miso=machine.Pin(39),
    cs=machine.Pin(12),
)
os.mount(sd, "/sd")
print(os.listdir("/sd"))
```

The mount succeeds, but the final firmware must do this at boot.

## 8. Battery voltage

Direct `machine.ADC(Pin(10))` failed on UIFlow2 2.5.3 with:

```text
OSError: (-261, 'ESP_ERR_NOT_FOUND')
```

Use the UIFlow2 API instead:

```python
import M5
print(M5.Power.getBatteryVoltage())  # millivolts
print(M5.Power.getBatteryLevel())    # percent
```

Observed: `4200` mV and `100` percent while USB-powered.

## 9. Bench harness

Files:

- `firmware/bench/bench.py`
- `firmware/bench/bme280.py` (vendored MIT driver)

Upload to `/flash/apps/bench/` with the UIFlow2 WebTerminal file manager, or through a normal REPL.

Run:

```python
import sys
sys.path.append("/flash/apps/bench")
import bench

bench.main(30)
bench.main(600)
```

The script:

- mounts `/sd` if needed
- scans I2C and requires the BME280
- reads pressure, temperature, and humidity
- reads battery voltage through `M5.Power`
- writes the project CSV header
- logs at 8 Hz
- flushes every 10 s and calls `os.sync()` if available
- writes `BENCH_START` and `BENCH_END` events

## 10. Results

| Test | Result |
|---|---|
| BME280 detection | `0x76`, chip ID `0x60` |
| 30 s smoke | 240/240 samples, 0 missed |
| 10 min at 8 Hz | 4,800/4,800 samples, 0 missed |
| Sample interval | 116-134 ms |
| Pressure | 100,987.36-101,005.56 Pa |
| Temperature | 23.02-23.59 C |
| Humidity | 44.10-46.30 % |
| Battery | 4.12-4.20 V, USB-powered |
| Log size | 407,201 bytes |
| Log rows | 4,802 data rows: 4,800 samples + 2 events |
| Parsing | `pipeline/ingest/read_log.py` accepts the file |
| Pipeline tests | 9/9 pass at setup time |

Log file from the setup run (committed):

```text
data/measurements/bench/BENCH_335502.csv
```

SHA256:

```text
47c93e19347b06802ba59fe2fa9b03294b56ac10f1efad88447f3cb0072d2222
```

The file is tracked through [`data/measurements/index.json`](../data/measurements/index.json). The CSV timestamps are empty because NTP/RTC was not configured.

## 11. Remaining

1. Test display sleep/wake under UIFlow2, or implement a brightness-off test.
2. Test standalone boot without WiFi and with the app at the boot location.
3. Test keyboard wake and event shortcuts under UIFlow2.
4. Configure NTP at the surface and verify `timestamp_iso`.
5. Implement the continuous logger core and event state machine.
6. Implement SD mount and recovery in the final firmware.
7. Run ground tests against known heights and station depths.

## 12. Recovery

Restore the verified stock image:

```bash
esptool --chip esp32s3 --port /dev/ttyACM0 --baud 921600 \
  write-flash 0x0 \
  ~/backups/cardputer/cardputer-stock-8mb.bin
```

Re-enter download mode first. Keep the backup outside the repository.

## 13. Field firmware deployment

Status: implemented 2026-10-30, see `firmware/field/` and the README field logger section.

Deploy steps that were verified on device:

1. Power the Cardputer into the UIFlow2 launcher menu.
2. Connect the WebTerminal at `https://uiflow2.m5stack.com/` (or a fresh serial REPL).
3. Create the app directory once:

```python
import os
try:
    os.mkdir("/flash/apps/field")
except OSError:
    pass
print("MDIR OK", os.listdir("/flash/apps"))
```

4. Upload the six `firmware/field/*.py` files to `/flash/apps/field/` with the WebTerminal file manager (binary upload preserves multi-line sources exactly; REPL pastes collapse newlines in this firmware and cannot be trusted for app files).
5. Copy the boot entry once per app update:

```python
open("/flash/main.py", "w").write(open("/flash/apps/field/main.py").read())
print("BOOTCOPY OK")
```

6. Bootstrap the boot option once:

```python
import esp32
nvs = esp32.NVS("uiflow")
nvs.set_u8("boot_option", 0)
nvs.commit()
import os
os.sync()
print("BOOTSET OK")
```

7. Power-cycle. `boot_option=0` runs `/flash/main.py` directly; the app owns the screen and keyboard from that moment.

Verified on-device behaviour:

- Dashboard draws and samples start as soon as a preset key (1-6) is pressed; before that the app sits idle with no rows.
- `S` gives a 60 s average with a countdown, `P` a 45 s one; pressing any key during a window cancels it.
- After the surface completes, station samples show the depth against the station surface; the surface store is keyed by station so the Alameda surface serves both lines.
- Platform completion writes `anchors.csv` (`line,station,depth_m`) on the card; the file reloads at boot.
- Ride mode (`r`) switches 1 Hz -> 8 Hz; sample spacing stayed 120-134 ms on-device; `k` logs `STATION_STOP` with the stored anchor depth or a `raw-anchor` note.
- `n` starts note capture; the next key within 15 s becomes the note tag.
- `q` closes the session (`SESSION_END` row, flush, rename `LX_CURRENT.csv` to the session name) and returns to idle.
- The microSD must be seated before power-up; the app shows `FIELD error / SD mount failed` otherwise. All SD pin facts are as in section 7.

Field fact: keyboard events work when the device runs on battery (USB unplugged). With a serial listener attached, keys may be dead; unplug, operate, replug. Serial REPL + WebTerminal are upload/debug tools only.

## 14. Recovery checklist (field firmware)

- A frozen screen means the app crashed: power-cycle. The latest crash reason was printed to the serial log (`FIELD crash: ...`); boot proceeds normally afterwards.
- If `/flash/main.py` needs a rewrite, use step 5 above; verify with `print('survey' in open('/flash/main.py').read())` before cycling.
- To return to the launcher for WebTerminal work, reset `boot_option=1` the same way as step 6 and power-cycle.

## References

- Project README: [`../README.md`](../README.md)
- M5Stack Cardputer docs: https://docs.m5stack.com/en/core/Cardputer
- UIFlow2 Cardputer guide: https://docs.m5stack.com/en/uiflow2/cardputer/program
- BME280 driver: https://github.com/robert-hh/BME280
