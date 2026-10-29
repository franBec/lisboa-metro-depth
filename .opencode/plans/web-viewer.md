# Plan: Lisbon Metro 3D Web Viewer

Status: local dummy implemented 2026-10-27. React/R3F/Tailwind port completed 2026-10-28. Real pipeline, real terrain, and deployment pending. Hardware pending.

Related: [`README.md`](../../README.md).

## Goal

Publish the Lisbon Metro depth survey as a public 3D visualization at `https://maps.pollito.tech/maps/lisboa`.

The site must show the network inside a hilly, recognizable Lisbon. It must distinguish measured, official, estimated, and unknown depths at all times.

## Locked decisions

1. Site address: `maps.pollito.tech`.
   - `/` is a small map index. Lisboa is the first entry.
   - `/maps/lisboa` is the viewer.
   - Future maps occupy sibling paths.
2. Visual direction: floating terrain slab with a cutaway view. Diorama, not a conventional web map.
3. Basemap: OSM data extracted at build time from Geofabrik. No tile provider, no API key, no runtime map SDK. Custom minimal style.
4. V1 data: official station depths plus estimated tunnel geometry. Measured ride data replaces estimates after the survey.
5. Stack: Vite, TypeScript, React 19, React Router, React Three Fiber, Tailwind CSS 4, TanStack Query, Zustand, Zod, and Three.js. No backend.
6. No database, no HTTP framework, no websocket. Static build artifacts only.
7. Landing page: prerendered at build time, readable without JavaScript.

## Non-goals

- Live GTFS feed or train animation. Possible later.
- User accounts, annotations, uploads.
- Survey editing in the browser.
- Other cities in v1.

## Architecture

```
GTFS (dados.gov.pt) ──┐
curated depths CSV ───┤
Geofabrik Portugal ───┼─> pipeline/ (Python, local) ─> web/public/data/v1/
Copernicus GLO-30 ────┘        cached raw sources          static assets
                                                                  |
                                                Docker build -> nginx -> Coolify
```

- The pipeline runs locally and its output is committed.
- The Docker image only builds the frontend and serves static files.
- The browser fetches the complete network once. No runtime API, websocket, or level-of-detail service.
- Data is small. No server-side filtering or database is justified.

## Verified data sources

Checked 2026-10-27.

| Source | Details |
|---|---|
| GTFS | `https://dados.gov.pt/s/resources/gtfs-do-metropolitano-de-lisboa/20261026-150924-d399cedf/googletransit.zip` |
| GTFS contents | 659,817 bytes. `shapes.txt` present, 380 coordinate rows across direction variants. `stops.txt` has 74 stops. |
| GTFS direct link | `metrolisboa.pt/google_transit/googleTransit.zip` returns 403. Use the dados.gov.pt mirror. |
| DEM | Copernicus GLO-30, public S3, tile `Copernicus_DSM_COG_10_N38_00_W010_00_DEM`. HTTP 200. One tile covers the metro bbox. |
| OSM | Geofabrik Portugal extract, 426,748,590 bytes. Accessible. |
| OSM entrances | `railway=subway_entrance` nodes, extracted from the Geofabrik PBF, not from GTFS. |

The GTFS geometry is coarse, roughly 117 m per point across 44.5 km. It is accurate enough for the city-scale view. Use OSM way geometry later if curves misalign with streets.

## Data model

Station fields:

- `id`, `name`, `lat`, `lon` (station label and entrance anchor)
- `lines[]`
- `surface_elevation_m`
- `platforms[]` - one record per line at the station

Platform fields:

- `line`
- `lat`, `lon` - projected onto the line shape
- `surface_elevation_m`
- `platform_depth_m`, nullable
- `depth_source`: `measured`, `official`, `estimated`, `unknown`
- `depth_basis`: `station` or `platform`
- `confidence_m`, nullable
- `official_depth_m`, nullable - retained baseline
- `measured_depth_m`, nullable
- `measurement_ids[]`
- `source_url`, nullable
- `note`, nullable

Network structure:

- `lines[]`
- each line has `segments[]` with a stable ID `LINE:sortedStationA-sortedStationB`
- each segment has `from`, `to`, `depth_source`, and `vertices[]`

Tunnel vertex fields:

- `lat`, `lon`
- `surface_elevation_m`
- `depth_m`, nullable
- `source`
- `distance_m` from line start

Depth is measured below the local ground surface, not below sea level. Scene height is `y = surface_elevation(x, z) - depth`.

Merge precedence: `measured` > `official` > `estimated` > `unknown`. Keep the official baseline when measured data replaces it. Never extrapolate measured data beyond the logged segment. Never copy one interchange platform depth to another line.

Station-level official values are not platform-level measurements. Mark them `depth_basis: station` and show the limitation in the QA panel.

Known station depths from `README.md`: 12 values. Only 10 are in the current GTFS network. All other current stations stay `unknown`. Do not invent values.

Known conflicts to preserve in the curated CSV:

- Aeroporto: 45.5 m vs 18.95 m.
- Baixa-Chiado: 45 m vs 38.75 m.
- Olivais: 36 m vs 28.65 m.
- Campo de Ourique: 31 m vs about 35 m.
- Infante Santo: 29.5 m vs about 19 m.

## Pipeline

Location: `pipeline/`.

1. Fetch sources into `data/raw/`, cached and gitignored.
2. Parse GTFS `routes.txt`, `stops.txt`, `shapes.txt`, `trips.txt`.
3. Select one direction per line. Merge shapes at interchanges.
4. Join `curated/station_depths.csv`.
5. Clip the Geofabrik PBF to the Lisbon bbox. Extract:
   - streets by highway class
   - water polygons
   - parks and green areas
   - `railway=subway_entrance`
6. Clip the Copernicus DEM. Build a heightmap and hillshade.
7. Simplify street geometry, drape every vertex on the DEM.
8. Interpolate tunnel depth between station anchors. Enforce the 4% grade cap. Mark every segment with provenance.
9. Emit:
   - `manifest.json` - bbox, version, generation date, attribution
   - `stations.json`
   - `network.json` - lines, tunnel polylines, per-vertex depth and source
   - `terrain.bin` - float32 heightmap
   - `ground.png` - hillshade, water, parks
10. Validate with tests (stdlib `unittest` in the dummy; pytest for the real pipeline):
    - schema shape and required fields
    - every station joins to a line
    - distance is monotonic
    - grade cap is respected
    - no NaN or infinite coordinates
    - unknown depths remain null

Raw 8 Hz CSVs are never served to the browser. Downsample measured profiles to about one point per 5-10 m before emitting.

### Output budget

- Network JSON under 1 MB.
- Terrain heightmap about 1 MB at 512x512 float32.
- Ground texture 1-3 MB.
- Total initial payload target under 5 MB.

Switch JSON to typed-array binary only if the measured data exceeds the budget.

## Dummy track (implemented 2026-10-27)

Purpose: validate the data contract, viewer, and measured-data plug path before the survey hardware arrives.

Location: `pipeline/dummy/`.

- `fetch_gtfs.py` - cache the pinned GTFS ZIP.
- `fetch_elevations.py` - fetch station surface elevations once from Open-Meteo and commit the CSV.
- `build_dummy.py` - select one full stop pattern per line, build per-platform station records, build stable segments, interpolate depths between official anchors, and emit the v1 assets.
- `gtfs.py` - GTFS parsing, canonical pattern selection, shape slicing.
- `terrain.py` - synthetic Lisbon-shaped heightfield with a Tagus mask, parks, coastline falloff, hillshade, and ground texture.
- `png.py` - dependency-free PNG writer.

Dummy rules:

- Real GTFS geometry.
- Only documented station depths. All other platform depths are null.
- Estimated tunnel depth only between two official anchors. Unknown outside.
- Unknown segments render as surface lines only.
- Synthetic terrain is labeled in the manifest and viewer.
- No OSM streets, no Copernicus raster, no Docker, no deployment.

Measured ingest skeleton: `pipeline/ingest/`.

- `read_log.py` - parse Cardputer CSV events and ride samples.
- `merge.py` - merge measured platform depths and segment profiles into the same assets.
- It updates `dataset_version`, `capabilities.measured_depths`, provenance counts, and leaves untouched segments byte-identical.
- It handles reversed ride directions by matching stations to segment orientation.
- Fixture: `pipeline/ingest/tests/fixtures/crossing_sample.csv`.

Crossing fixture: Green Areeiro-Alameda-Arroios and Red Olaias-Alameda-Saldanha. The fixture marks Alameda C at 30 m and Alameda D at 35 m, proving a 5 m vertical separation. It is synthetic test data.

Viewer additions implemented for the dummy:

- Per-platform station panel.
- Interchange crossing QA panel with unresolved warning.
- X-ray terrain toggle for underground inspection.
- Multi-line focus `?line=C,D`.
- Station focus `?station=alameda`.
- X-ray URL state `?xray=1`.
- Stable legend counts from the manifest.
- Label decluttering.

## Replace-and-plug procedure

When real data exists:

1. Run the real pipeline or `pipeline/ingest/merge.py`.
2. Overwrite the same five files in `web/public/data/v1/`.
3. Set `demo: false` when terrain becomes real.
4. Set `capabilities.measured_depths: true`, `real_terrain: true`, and `streets: true` as layers arrive.
5. Bump `dataset_version`. Keep `schema_version: 1` unless the contract changes.

The viewer needs no code change for a partial measured overlay. Only the matching segment IDs and platform records change. A full contract break requires a new schema version and a matching viewer change.

## Web application

Location: `web/`.

- Vite React-TS app.
- React Router routes: `/`, `/maps/lisboa`, `/maps/lisboa/method`, and a not-found route.
- `src/data/` - Zod schemas, manifest-first loader, TanStack Query cache.
- `src/state/` - Zustand UI state and URL state helpers.
- `src/scene/` - React Three Fiber terrain, tunnels, stations, labels, and camera.
- `src/components/hud/` - viewer panels, legend, line picker, and station QA.
- `src/styles/` - Tailwind entry, landing styles, and viewer styles.
- `scripts/prerender.tsx` - renders the landing page and writes route entry documents.
- `public/data/v1/` - generated assets.

Landing page:

- prerendered React tree with title, description, Lisboa card, and credits
- readable without client JavaScript
- `dist/index.html` contains the landing markup
- `dist/maps/lisboa/index.html` and `dist/maps/lisboa/method/index.html` are generated as empty-root entry documents
- the client hydrates prerendered markup and creates roots for viewer routes
- static servers should keep generated route files and add `try_files $uri $uri/ /index.html;` for unknown SPA paths

## 3D scene

### Terrain

- Local ENU meters centered on the bbox. No Web Mercator distortion.
- Heightfield mesh with normals computed from the heightmap.
- Hillshade, Tagus, and parks baked into the ground texture.
- Streets as merged `LineSegments` draped on the DEM, one draw call.
- Terrain slab: top surface, perimeter skirts, bottom plane.
- Fixed quarter cutaway with cross-section ribbons that show hill relief. Toggle between open and closed.

### Metro

- One `TubeGeometry` or line ribbon per line.
- Horizontal geometry from GTFS shapes, refined against OSM where needed.
- Depth from station anchors with interpolation and the 4% grade cap.
- Stations: ring at platform depth, shaft to the surface, surface label.
- Unknown-depth segments: dotted surface line only. Never draw fake underground geometry.

### Provenance styling

| Source | Style |
|---|---|
| measured | solid, bright |
| official | solid, muted |
| estimated | dashed, faded |
| unknown | hollow marker or surface line |

A legend is always visible. A toggle hides estimated and unknown data.

### Interaction

- Orbit, pan, zoom, damping.
- Double-click a station to fly to it.
- Line picker highlights one line and dims the rest. URL state `?line=A`.
- Station panel: name, line(s), per-platform depth, surface elevation, source, confidence.
- Interchange QA panel: per-line platform depth and vertical gap; unresolved warning when a platform depth is unknown.
- Toggles: basemap, labels, x-ray terrain, vertical exaggeration, cutaway, provenance.
- URL state: `?line=C,D`, `?station=alameda`, `?xray=1`.
- Vertical exaggeration 1x-20x, default 10x. Always show `vertical scale x10`.
- Strive for a true-scale toggle.
- Mobile: cap device pixel ratio, one draw call per layer, no expensive postprocessing.

## Deployment

- Multi-stage `Dockerfile`: `node:22-alpine` build, `nginx:alpine` serve.
- Build command: `pnpm --dir web build`. It typechecks, builds Vite assets, and prerenders the landing and route entry documents.
- `docker-compose.yml`: one `web` service, `expose: 80`, healthcheck, `restart: unless-stopped`.
- Coolify domain: `maps.pollito.tech`. TLS managed by Coolify.
- nginx SPA fallback for unknown paths: `try_files $uri $uri/ /index.html;`.
- Cache policy: hashed assets and `/data/v1/` immutable. HTML no-store.
- Gzip enabled. Brotli if available.

## Repository layout

```
.opencode/plans/          this plan
firmware/                 MicroPython, later
pipeline/
  fetch.py
  build.py
  curated/station_depths.csv
data/raw/                 gitignored
web/
  index.html
  scripts/prerender.tsx
  src/
    components/hud/
    data/
    lib/
    routes/
    scene/
    state/
    styles/
  public/data/v1/
Dockerfile
docker-compose.yml
nginx.conf
README.md
```

## Milestones

1. M0 - Skeleton
   - Vite React app, nginx, Dockerfile, compose.
   - Placeholder landing and viewer deployed to Coolify.
2. M1 - Pipeline v0
   - GTFS, curated depths, DEM, and OSM extraction.
   - Generated v1 assets with validation tests.
3. M2 - Scene
   - Terrain slab, cutaway, streets, tunnels, stations, camera.
   - Local terrain, tunnels, stations, labels, and camera implemented 2026-10-28. Cutaway and streets pending.
4. M3 - Interaction and UI
   - Line picker, station panel, toggles, labels, mobile, method page.
   - Implemented 2026-10-28.
5. M4 - Launch
   - Deploy, attribution, data download, acceptance checks.
6. M5 - Measured data
   - Ingest CSVs, replace estimated sections, rebuild.

## Acceptance criteria

- Live at `https://maps.pollito.tech`.
- First load under 5 MB. Interactive under 2 seconds on desktop.
- 60 fps desktop, 30 fps mobile, no console errors.
- Every displayed depth carries visible provenance.
- No fabricated geometry for unknown stations.
- Landing page works without JavaScript.
- Direct route documents exist for `/`, `/maps/lisboa/`, and `/maps/lisboa/method/`.
- Correct attribution for OSM, Copernicus, and Metropolitano de Lisboa.

## Risks

| Risk | Mitigation |
|---|---|
| Only 12 official station depths | Show unknown honestly; fill from survey later |
| GTFS shapes are coarse | Refine against OSM way geometry |
| Geofabrik extract is 427 MB | Cache once, clip to bbox |
| Direct Metropolitano GTFS blocked | Use the dados.gov.pt mirror and pin the dated URL |
| Vertical exaggeration misleads | Label the scale, offer true-scale toggle |
| Ride profile is weak | Style as estimated, never as measured |
| Cutaway capping is complex | Fixed quarter cut with precomputed cross-section ribbons |
| OSM and DEM licensing | Visible credits and a method page |

## Open questions

- Exact bbox, including margin around the outermost stations.
- Which highway classes appear at default zoom.
- Whether to publish raw CSV downloads.
- Naming scheme for future maps under `maps.pollito.tech`.
