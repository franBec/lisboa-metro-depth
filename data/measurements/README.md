# Measurement data

This directory holds the raw CSVs recorded by the Cardputer. The files are the primary record and are immutable. Do not edit, normalize, or regenerate them in place. Derived assets stay in `web/public/data/v1/`.

Downloads and caches such as the GTFS feed stay in `data/raw/`, which is gitignored.

## Layout

```text
data/measurements/
  index.json         provenance, hashes, and row counts for every file
  bench/             hardware bench and endurance logs
  field/             station, entrance, and ride-through survey logs
```

## Index

Every CSV must have an entry in `index.json` with:

- `session_id`: the `session_id` column in the CSV
- `file`: path relative to this directory
- `kind`: `bench` or `survey`
- `date`: recording date, `YYYY-MM-DD`
- `duration_s`: elapsed seconds between the first and last `millis`
- `rows`: data rows, excluding the header
- `bytes`: file size
- `sha256`: file digest
- `notes`: what the run tested

The top-level `device` block records the hardware and firmware used for these logs.

## CSV format

The schema and event vocabulary are documented in the project [README](../../README.md#csv-schema). Timestamps are empty when NTP/RTC was not configured; `millis` remains the ordering field.

## Adding a session

1. Copy the CSV from the microSD card without modifying it.
2. Put bench logs in `bench/` and survey logs in `field/`.
3. Add an `index.json` entry. Compute the digest with `sha256sum <file>`.
4. Run `python3 pipeline/ingest/check_field_log.py <file>` and inspect the event and measurement summary.
5. Run `python3 -m unittest discover -s pipeline/tests -v`.

Keep field notes free of personal information because the raw files are published.

## License

The files under `data/measurements/` are licensed under the Creative Commons Attribution 4.0 International License (CC BY 4.0). See [`LICENSE-DATA`](../../LICENSE-DATA). Third-party data such as the GTFS feed keeps its own terms and is not redistributed here.
