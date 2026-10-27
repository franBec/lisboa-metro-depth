# Lisbon Metro 3D Depth Mapper

Measure Lisbon Metro station depths and approximate tunnel profiles with a compact barometric logger. Combine the result with OpenStreetMap, GTFS, and a surface DEM to build a public 3D visualization.

This README is the living project document. Update it as work progresses.

## Status

- Hardware ordered 2026-10-27 (Mauser order 2026EC1631140, EUR 89.41). Awaiting delivery. Bench tests start on arrival.
- Firmware not started.
- Local web demo implemented 2026-10-27. Real GTFS geometry, documented depths only, synthetic terrain, x-ray view, crossing QA panel, and a measured-log ingest fixture. No deployment.
- Web viewer plan: [`.opencode/plans/web-viewer.md`](.opencode/plans/web-viewer.md).
- Owner: Franco.
- Date: 2026-10-27.

## Local web demo

Run the dummy viewer:

```bash
python3 pipeline/dummy/fetch_gtfs.py
python3 pipeline/dummy/fetch_elevations.py
python3 pipeline/dummy/build_dummy.py
pnpm --dir web install
pnpm --dir web dev
```

Open `http://localhost:5173/maps/lisboa/`.

Useful views:

- `?xray=1` shows the terrain as x-ray so estimated tunnels are visible.
- `?line=C,D` isolates two lines.
- `?station=alameda` focuses a station and opens the crossing QA panel.

Checks:

```bash
python3 -m unittest discover -s pipeline/tests -v
pnpm --dir web typecheck
pnpm --dir web build
pnpm --dir web preview
```

The demo uses `web/public/data/v1/` with the same asset contract the final pipeline will use. The measured fixture is at `pipeline/ingest/tests/fixtures/crossing_sample.csv` and merges only the four crossing segments around Alameda. It is synthetic test data, not a survey.

Current limitation: only 10 current stations have documented depths. Most corridor sections therefore stay unknown or estimated until the survey replaces them. The viewer never draws a guessed crossing for an unknown platform.

## Core decisions

1. **Hardware:** M5Stack Cardputer + Seeed Grove BME280 + microSD. Zero soldering.
2. **Logging model:** one continuous CSV per session, with event markers. No separate station or ride files.
3. **Log rates:** 1 Hz at stations, 8 Hz during rides. Keep raw data.
4. **Station depth:** surface pressure average vs platform pressure average. 30-60 s windows.
5. **Tunnel profile:** approximate. Barometric pressure during train motion is dominated by tunnel and vehicle pressure transients. Use low-pass filtering, station anchors, and the 4% maximum grade constraint.
6. **Phone role:** GPS, photos, voice notes, long notes. Merge with Cardputer data by timestamp and event ID.
7. **Time:** Cardputer has no RTC. Sync via NTP at the surface through a phone hotspot, or use relative `millis` plus phone notes.
8. **Budget:** EUR 89.41 paid for the full BOM, under the EUR 100 with-spares target.
9. **Language stack:** Python first. Firmware is MicroPython on the UIFlow2 Cardputer firmware. Post-processing is Python. The web viewer is TypeScript with Three.js. Java is not required. C++ is a fallback only.
10. **Web stack:** static site. Vite, TypeScript, Three.js, nginx. No database, no HTTP framework, no websocket. See the viewer plan.

## Hardware

### Bill of materials

Purchased 2026-10-27 from Mauser (order 2026EC1631140, EUR 89.41 total).

| Part | Price | Source | Ref |
|---|---:|---|---|
| M5Stack Cardputer | EUR 37.70 | https://mauser.pt/095-3121/m5stack-cardputer-mini-computador-portatil-com-stamps3-bateria-teclado-e-display-de-1-14 | 095-3121 |
| Seeed Grove BME280 | EUR 17.80 | https://mauser.pt/096-6714/seeed-modulo-grove-sensor-de-temperatura-humidade-e-pressao-atmosf-bme280 | 096-6714 |
| Grove cable, 5 cm, 5-pack | EUR 1.40 | https://mauser.pt/096-6575/seeed-conjunto-de-5-cabos-grove-4-pinos-5cm | 096-6575 |
| Grove cable, 20 cm, 5-pack | EUR 2.50 | https://mauser.pt/096-6569/seeed-conjunto-de-5-cabos-grove-4-pinos-20cm | 096-6569 |
| SanDisk Ultra microSDHC 32GB Class 10 + SD adapter (FAT32) | EUR 24.91 | https://mauser.pt/047-3572/sandisk-ultra | 047-3572 |
| Logilink CR0039 USB-C microSD reader | EUR 5.10 | https://mauser.pt/047-5653/logilink-cr0039 | 047-5653 |

**Total:** EUR 89.41 paid.

**Mauser Lisboa:** R. Eng. Manuel Rocha 33, 1700-046 Lisboa. Monday-Friday 09:00-13:00, 14:00-18:00. +351 218 435 990. https://mauser.pt/lojas

### Alternatives considered

- **Sensor upgrade:** M5Stack ENV III uses QMP6988. Pressure error about +/-3.9 Pa (about 0.33 m), better than BME280's +/-0.12 hPa (about 1 m). Not required; environmental bias dominates. Source: https://www.tinytronics.nl/en/sensors/air/pressure/m5stack-env-iii-unit
- **Device upgrade:** M5Stack Cardputer ADV adds a 6-axis IMU and newer keyboard/audio. Not chosen because the phone already has an IMU and the original Cardputer is locally available and cheaper. Source: https://www.tinytronics.nl/nl/platformen-en-systemen/m5stack/m5stamp/m5stamp/m5stack-m5cardputer-adv-esp32-s3-card-sized-computer-met-1.14-inch-display

### Why the Cardputer

- ESP32-S3, 1.14-inch 240x135 display, 56-key keyboard, microSD slot, Grove I2C port, USB-C.
- 120 mAh internal battery plus 1400 mAh base battery. 84 x 54 x 19.7 mm, 92 g.
- Finished enclosure. Looks like a small calculator or PDA.
- No camera. Microphone, speaker, IR, WiFi, and BLE can be disabled in firmware.
- The Seeed Grove BME280 plugs directly into the Grove port. No breadboard, perfboard, or soldering.
- The keyboard is good enough for station and entrance IDs, event markers, and short notes.
- No RTC and no IMU on the original Cardputer. Use NTP and the phone.

Documentation:

- https://docs.m5stack.com/en/core/Cardputer
- https://docs.m5stack.com/en/core/Cardputer_v1.1

## Firmware

Stack: MicroPython with the M5Stack UIFlow2 Cardputer firmware. Write the survey app in Python and deploy it through the UIFlow2 WebTerminal file manager or the UIFlow2 IDE. Pin the firmware version and document it.

Deployment:

- Flash the Cardputer UIFlow2 firmware with M5Burner.
- Set boot option `Run main.py directly` for standalone field use.
- Put the app in `/flash/apps` for APP.LIST testing, or at the boot location used by `main.py`; confirm during bench tests.
- Keep source in the repository under `firmware/`; upload the files after each change.
- Fallback order if UIFlow2 blocks the design: plain MicroPython with community Cardputer drivers, then CircuitPython, then Arduino C++.

### Modules

- `main.py` - boot, setup, main loop, power management.
- `sensors.py` - BME280 sampling, averaging, pressure-to-height conversion.
- `logger.py` - continuous CSV writer, flush policy, file rotation if needed.
- `ui.py` - dashboard, station page, ride page, calibration, files, settings.
- `survey.py` - event state machine, station and entrance context, ride context.
- `storage.py` - SD mount, free space, file naming, session recovery.
- `timebase.py` - RTC, NTP, `millis`, timestamp formatting.
- `config.py` - pins, log rates, station list, feature flags.

### Implementation notes

- Use `time.ticks_ms` and `ticks_diff` for the sampling deadline. Do not use `sleep` for rate control.
- Use BME280 forced mode with low oversampling. Keep the sensor away from the Cardputer and body.
- Keep `millis` as the primary ordering field. Write `timestamp_iso` when the RTC is set.
- Flush the CSV every 10 s. Call `os.sync()` after the flush if the port provides it.
- Read battery voltage from ADC GPIO10 with the 2:1 divider.
- Disable WiFi after NTP sync. Keep radios, RGB LED, speaker, and microphone off.
- UIFlow2 puts the keyboard in low-power sleep at boot; waking it needs `fn` plus a key. Test this in the bench tests. If it is impractical in the field, use `BtnA`/G0 for event markers or switch runtime.
- Use a watchdog with a long timeout. Feed it in the main loop and keep the timeout longer than the worst-case SD flush.
- Keep pure logic small enough to run under both MicroPython and CPython where practical: pressure conversion, CSV formatting, event state machine.

### Continuous log

The logger starts at boot and writes until shutdown. There is no "start logging" action. Events are annotations in the same stream.

- File name: `LX_YYYYMMDD_HHMMSS.csv` if time is known; otherwise `LX_0001.csv`.
- Write header at boot.
- Flush every 10 s.
- Close file on shutdown or when the user explicitly ends the session.
- Check free space and show a warning below 100 MB.
- 8 Hz CSV is roughly 5 MB/hour; 32 GB is ample.

### CSV schema

```csv
session_id,seq,timestamp_iso,millis,record_type,mode,line,station,platform,direction,entrance,event,pressure_pa,temp_c,humidity,depth_m,battery_v,note
```

- `record_type`: `sample` or `event`.
- `mode`: `idle`, `station`, `ride`, `calibration`.
- `platform`: platform or track identifier; required at interchanges, optional elsewhere.
- `direction`: travel direction for ride rows; optional at stations.
- `event`: empty for samples; event name for event rows.
- `pressure_pa`: absolute pressure in pascals.
- `depth_m`: positive downwards from the last surface reference; empty until a reference exists.
- `battery_v`: measured battery voltage.
- `note`: free text.

At interchanges, record each platform separately with its own `line` and `platform`. Do not copy one platform measurement to the other line.

Example:

```csv
LX_20261027_101500,1,2026-10-27T10:15:00+00:00,1200,sample,station,Azul,Baixa-Chiado,P1,,Entrance A,,101325.2,21.4,55.1,,4.05,
LX_20261027_101500,2,2026-10-27T10:15:30+00:00,31200,event,station,Azul,Baixa-Chiado,P1,,Entrance A,SURFACE,101320.5,21.3,55.0,0.0,4.05,30s average
LX_20261027_101500,3,2026-10-27T10:17:10+00:00,131200,event,station,Azul,Baixa-Chiado,P1,,Entrance A,PLATFORM,100872.0,21.1,60.2,38.6,4.04,30s average
```

### Event vocabulary

- `SESSION_START`, `SESSION_END`
- `SURFACE` - set reference; 30-60 s average
- `PLATFORM` - compute depth vs last `SURFACE`; 30-60 s average
- `RIDE_START`, `RIDE_END`
- `STATION_STOP` - anchor during ride
- `NOTE`
- `CALIBRATION` - known depth vs measured depth

Add fields or events as needed, but keep the stream append-only and easy to parse.

### UI

Persistent status: mode, battery, SD state, log rate, sample count, pressure, depth.

Pages:

1. **Dashboard** - live pressure, relative height, depth, temperature, humidity, battery, SD, elapsed time, stability indicator.
2. **Station** - line, station, entrance. `S` surface, `P` platform, `N` note.
3. **Ride** - line, direction, car position, crowd level. `R` start/end, `K` station stop, `N` note.
4. **Calibration** - enter known depth, compare, store offset.
5. **Settings** - log rate, screen timeout, NTP sync, units, radio off.
6. **Files** - current file, size, free space, delete.

Keyboard shortcuts are suggestions; design the final UI as needed.

Useful additions:

- Pressure-stability indicator over the last 10 s. Prompt the user when the signal is stable enough to mark.
- Auto-switch to 8 Hz when a ride starts.
- Screen off after 30 s. Wake on key or side button.
- Dim or disable the RGB LED. No audible beeps by default.
- Cover the microphone hole with tape and disable the microphone, speaker, and IR in firmware.

### Time

No RTC. At the surface, connect to a phone hotspot, run NTP, then disable WiFi. If NTP is unavailable, log `millis` and use phone notes for alignment.

## Field protocol

### Carrying

- Use the 5 cm Grove cable for station measurements. Cardputer in one hand; sensor held by its edges in the other. No dangling cable.
- Use the 20 cm Grove cable for rides. Route it inside clothing. Cardputer in an inner pocket, screen off. Sensor in an open chest pocket or backpack side pocket.
- The pocket must breathe. No sealed plastic bag. Test pressure lag in an elevator: if the reading lags, move the sensor out.
- Do not cover the BME280 pressure port with a finger or tape. Hold the module by its PCB edges.

### Posture and position

- Pressure is independent of posture. A 1 m height change is about 0.1 m equivalent.
- Sitting mid-car is best for ride logging. Standing mid-car away from doors and HVAC vents is fine.
- Avoid the front and rear car, door wells, ceiling vents, and leaning on doors.
- Middle car has weaker pressure transients than the head car.
- In an empty carriage, sit mid-car. In a full carriage, stand mid-car or sit if possible.

### Station measurement

1. Stand outside the entrance, away from building vents and doors.
2. Hold the sensor at chest height.
3. Press `S`, wait 30-60 s for the average.
4. Descend to the platform.
5. Stand away from the platform edge, train doors, and ceiling vents.
6. Press `P`, wait 30-60 s. Depth appears.
7. Record entrance ID and notes with the phone.
8. At interchanges, repeat for each line and platform.
9. Repeat for 2-3 entrances where practical.

Dwell time does not matter for platform depth. Measure after the train leaves to avoid piston effects.

### Ride-through

1. Select line and direction.
2. Sit or stand mid-car.
3. Press `R` to start the ride segment.
4. Log at 8 Hz, screen off.
5. Press `K` at each station stop. Use the last 10-20 s of dwell with doors open.
6. Add notes for unusual stops, tunnel stops, door state, crowd, car position.
7. Press `R` to end the segment.

Longer dwell is better for anchors. If the train waits for the opposite direction, that is a good anchor; note whether doors are open or closed. A stop inside a tunnel is not a station anchor; ignore it unless the location is known.

## Accuracy

### Error budget

These are estimates. Pilot measurements will replace them.

| Measurement | Expected error |
|---|---:|
| BME280 relative accuracy | +/-0.12 hPa, about +/-1 m |
| BME280 resolution | about 0.002 hPa, about 2 cm |
| Station depth, single entrance | +/-1-3 m |
| Station depth, calibrated against known stations | +/-1-2 m |
| Tunnel profile, mid-segment | +/-3-10 m |
| Horizontal geometry, OSM/GTFS | +/-1-5 m |
| Deepest station, 54 m | +/-2-3 m |

### Sources of error

- HVAC and station pressurisation: 1-3 m bias.
- Weather drift: negligible within 5-10 min; re-reference at each station.
- Body heat and pocket lag: avoid by keeping the sensor ventilated and away from the body.
- Train and tunnel pressure waves: hundreds of Pa, equivalent to tens of metres instantaneously. The cabin attenuates them, but they dominate the raw ride signal.
- Sensor self-heating: minor for pressure; keep away from the Cardputer and body.

Tunnel profile is the weak part. Published metro measurements show pressure transients of hundreds of Pa. Low-pass filtering plus station anchors gives a coarse shape and approximate grades, not survey-grade depth. Use official track elevations for new lines where available, plus the 4% maximum grade constraint, and treat the barometer log as a soft constraint.

Reference: https://www.mdpi.com/2673-3951/6/4/113

## Testing

### Bench tests

1. Flash UIFlow2 firmware; confirm version, boot mode, and serial/file access.
2. Upload a multi-file app; confirm imports and standalone boot without WiFi.
3. Confirm keyboard wake (`fn` plus a key) and event shortcuts.
4. Mount a FAT32 microSD card; write, flush, unmount, and re-read a CSV.
5. Read BME280 pressure, temperature, and humidity at 8 Hz for 10 min.
6. Read battery voltage and compare with a USB meter.
7. Confirm display sleep, wake, and radio-off behavior.

### Ground tests

1. Elevator or staircase with known height. Target under 1-2 m error.
2. Known station depths: Baixa-Chiado 38.75 m, Olivais 28.65 m, Aeroporto 18.95 m.
3. Repeat the same station three times; check spread.
4. Fixed-location drift test for 1 hour.
5. Four-hour continuous log for SD integrity and battery.
6. Short ride segment on a known section; compare pressure profile with station anchors.

### Crossing pilot

First field test after bench tests:

- Green: Areeiro, Alameda, Arroios.
- Red: Olaias, Alameda, Saldanha.

At Alameda, measure both platforms separately with `line=C` and `line=D`. Without both values the viewer correctly reports an unresolved crossing.

Then ride the two sections with `RIDE_START`, `STATION_STOP` at Alameda, and `RIDE_END`. Merge the log with:

```bash
python3 pipeline/ingest/merge.py --input data/logs/LX_YYYYMMDD_HHMMSS.csv --data web/public/data/v1
```

Expected result: four measured segments, measured platform depths at Alameda, and a crossing QA panel showing the vertical gap. The checked-in `crossing_sample.csv` fixture demonstrates the same path with synthetic values.

## Data pipeline

Use Python with `pandas`, `numpy`, `scipy.signal`, `gtfs-kit`, and `rasterio`. Keep the pipeline reproducible with a pinned environment.

1. Parse the continuous CSV.
2. Split into station, ride, and calibration segments using events.
3. Convert pressure to height with the hypsometric formula.
4. Compute station depth from surface and platform averages.
5. Filter ride pressure with a low-pass filter, cutoff about 0.02-0.05 Hz.
6. Anchor the ride profile at station platform averages.
7. Apply a maximum grade constraint of 4%.
8. Merge with OSM/GTFS distance and phone GPS/IMU data.
9. Flag measured, anchored, interpolated, and uncertain sections.
10. Feed station depths and tunnel profiles into the 3D viewer.

The dummy viewer pipeline is in `pipeline/dummy/`. It uses GTFS, curated depths, cached Open-Meteo station elevations, and a synthetic terrain heightfield. No Geofabrik PBF or Copernicus raster is used yet.

The measured-data ingest skeleton is in `pipeline/ingest/`. It parses the Cardputer CSV, builds platform and segment profiles, and merges them into the same data assets. It keeps official baselines, uses measured values only where logged, and updates the manifest capability flags.

The viewer pipeline is specified in [`.opencode/plans/web-viewer.md`](.opencode/plans/web-viewer.md).

## Web viewer

Static site at `maps.pollito.tech`:

- `/` - map index.
- `/maps/lisboa` - 3D viewer.
- `/maps/lisboa/method` - method, provenance, and data downloads.

Visual direction: Lisbon as a floating terrain slab with a cutaway view. Hills, streets, and the Tagus on top; metro tunnels inside. The ground is a real heightfield, not a flat overlay, so hilly terrain is represented correctly.

Stack: Vite, TypeScript, Three.js, vanilla DOM, nginx. No backend, database, or websocket. The browser fetches the complete network once. Depths are styled by provenance: measured, official, estimated, or unknown. Unknown data is never drawn as fake underground geometry.

The local demo includes an x-ray terrain toggle, per-platform interchange records, a QA panel that reports the vertical gap at a crossing, multi-line filtering, and URL state. The planned quarter cutaway, real OSM basemap, and Coolify deployment remain deferred.

Full design, data model, milestones, and acceptance criteria: [`.opencode/plans/web-viewer.md`](.opencode/plans/web-viewer.md).

### Horizontal data sources

- OpenStreetMap `railway=subway`, station, and entrance data.
- Metropolitano de Lisboa GTFS mirror: https://dados.gov.pt/s/resources/gtfs-do-metropolitano-de-lisboa/20261026-150924-d399cedf/googletransit.zip The direct `metrolisboa.pt` link returns 403.
- Lisbon open data: `Rede Ferroviária Subterrânea` and `Estações de Metro`.
- Surface DEM: Copernicus GLO-30 or Lisbon LiDAR.

No dedicated Lisbon Metro 3D depth viewer was found. `metroxray.com` covers London, Prague, and Budapest only. OSM, GTFS, and Lisbon city GIS provide horizontal geometry but no continuous vertical profile.

### Depth and elevation sources

Quality caveats apply.

- Metro/Observador list of 12 deepest stations: Estrela 54.00, Baixa-Chiado 38.75, Olivais 28.65, Ameixoeira 28.40, Encarnação 25.45, Parque 24.65, Santos 24.00, Rato 23.15, Moscavide 21.95, Terreiro do Paço 19.95, Saldanha 19.95, Aeroporto 18.95.
- Official expansion pages: Estrela about 54 m, Santos about 25 m, Amoreiras 18.5 m, Campo de Ourique 31 m, Infante Santo 29.5 m.
- Wikipedia station articles and list: low confidence, inconsistent.
- EIA/RECAPE PDFs: track elevations and longitudinal profiles for new lines.
- Geotechnical papers: tunnel depth ranges and construction data.

Known conflicts:

- Aeroporto: Wikipedia says 45.5 m; Observador/Metro says 18.95 m; project description says about 20.06 m.
- Baixa-Chiado: Wikipedia says 45 m; Observador/Metro says 38.75 m.
- Olivais: Wikipedia says 36 m; Observador/Metro says 28.65 m.
- Campo de Ourique: official page says 31 m; older dossier says about 35 m track depth.
- Infante Santo: official page says 29.5 m; older dossier says average about 19 m.

### Network facts

- Total: 44.5 km, 56 stations.
- Azul: 13.8 km.
- Amarela: 11.1 km.
- Verde: 9.0 km.
- Vermelha: 10.6 km.
- Circular line adds about 2 km; Red line extension adds about 4.1 km.

New stations:

- Estrela and Santos: opening planned Q1 2027. Not accessible for survey as of 2026-10-27.
- Red line extension to Alcântara: planned around 2030.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| HVAC/station pressurisation bias | Measure away from vents; 2-3 entrances; calibrate against known stations. |
| Train/tunnel pressure transients | 8 Hz logging; low-pass filter; station anchors; middle car; note door state. |
| Sensor in pocket lags | Use open pocket; test in elevator; move sensor outside if needed. |
| No RTC | NTP at surface; relative time plus phone notes. |
| SD corruption on power loss | Quality card; flush every 10 s; close on shutdown; keep backups. |
| MicroPython SD write reliability | Flush and sync; quality card; 4-hour test; C++ fallback last. |
| UIFlow2 keyboard sleep | Test `fn` plus key in the bench tests; use `BtnA`/G0 markers or another runtime if impractical. |
| UIFlow2 API or firmware drift | Pin firmware version; document used APIs; keep alternate runtime tested. |
| Device looks suspicious | Calculator-like enclosure; short cable; screen off; no camera; disable radios, mic, speaker, IR; no filming. |
| Battery life | 1400 mAh base; charge nightly; screen off; optional power bank. |
| Cardputer not rugged | Soft pouch; strain relief on Grove cable; do not block doors or platform access. |
| Data volume | 8 Hz is about 5 MB/hour; 32 GB card is ample. |
| Few official station depths | Mark unknown values; fill from the survey; never invent data. |
| Coarse GTFS shapes | Refine against OSM way geometry. |
| Vertical exaggeration misleads | Label the scale; offer a true-scale toggle. |

## Roadmap

1. ~~Buy Cardputer, Grove BME280, 5 cm and 20 cm Grove cables, microSD.~~ Done 2026-10-27, order 2026EC1631140 (includes USB-C reader).
2. Web M0: repo skeleton, Vite pages, nginx, Docker, Coolify placeholder.
3. Web M1: pipeline v0 from GTFS, curated depths, DEM, and OSM.
4. Web M2: terrain slab, cutaway, tunnels, stations, camera.
5. Web M3: line picker, station panel, toggles, labels, mobile, method page.
6. Web M4: deploy, attribution, data download, acceptance checks.
7. Bench test: flash UIFlow2, multi-file boot, keyboard wake, sensor read, SD write, display, battery.
8. Implement continuous logger core and CSV schema in MicroPython.
9. Implement UI, event markers, stability indicator, NTP sync.
10. Build desktop `pytest` suite with fake sensor, clock, and storage.
11. Run ground tests against known heights and station depths.
12. Pilot three stations and one short ride.
13. Full station survey and ride-through logging.
14. Web M5: ingest measured CSVs, replace estimated sections, rebuild.
15. Post-process data and publish the final viewer.

## Open questions

- Final firmware UI layout and station/entrance list format.
- Whether to add BLE phone sync or stay standalone.
- Whether to add a second BME280 or ENV III for cross-checking.
- UIFlow2 multi-file boot location and keyboard wake behavior in the field.
- Fallback runtime choice if UIFlow2 is unreliable: plain MicroPython or CircuitPython.
- How to reconcile conflicting official and third-party depth values.
- Viewer bbox, including margin around the outermost stations.
- Which OSM highway classes appear at default zoom.
- Landing page copy and visual identity.
- Whether to publish raw CSV downloads.
- Naming scheme for future maps under `maps.pollito.tech`.
