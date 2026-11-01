import { InfoPage } from '../components/InfoPage'

export function MethodRoute() {
  return (
    <InfoPage title="Method">
      <p>
        This map shows published station depths and estimated tunnel profiles for
        the Lisbon Metro. Every depth carries its provenance. Unknown values stay
        unknown, and the viewer never draws a guessed crossing. Known
        cross-platform interchanges are modeled explicitly from OpenStreetMap
        platform geometry.
      </p>

      <h2>Sources</h2>
      <ul>
        <li>Metropolitano de Lisboa GTFS: line shapes, stops, and timetable.</li>
        <li>
          OpenStreetMap route and platform geometry (ODbL): track alignment and
          parallel interchange layouts.
        </li>
        <li>
          Open-Meteo Elevation API, based on Copernicus DEM: station surface
          elevations.
        </li>
        <li>
          Official station depth publications and curated records, marked as
          station-level values.
        </li>
      </ul>

      <h2>Provenance</h2>
      <ul>
        <li>
          <strong>Measured</strong>: survey data from this project. Solid and
          bright.
        </li>
        <li>
          <strong>Official</strong>: published station depth. Solid and muted. The
          value can be station-level, not platform-level.
        </li>
        <li>
          <strong>Estimated</strong>: interpolated between known anchors. Dashed
          and faded.
        </li>
        <li>
          <strong>Unknown</strong>: no depth. Shown at the surface only, dotted.
        </li>
      </ul>

      <h2>Tunnel sections</h2>
      <p>
        A tunnel section uses the measured or official platform depth at each
        end and the station surface elevation from the Copernicus DEM. Track
        level is surface minus depth. Average slope is the track-level change
        divided by the track length between platforms. It is an average, not a
        continuous measured grade.
      </p>
      <ul>
        <li>
          Measured platform depths currently resolve four tunnel sections
          around Alameda.
        </li>
        <li>
          Three more sections use official station-level depths. Their slope is
          indicative, not platform-level.
        </li>
        <li>
          The line between two known platforms is drawn straight. The tunnel
          shape between them is not surveyed.
        </li>
        <li>
          Raw ride profiles are clamped to the 4% grade cap before they reach
          the geometry. They are not filtered or re-referenced yet.
        </li>
        <li>
          Baixa-Chiado and Campo Grande are cross-platform interchanges. Their
          platforms run side by side; the model shows one representative track
          and platform per line, not all four tracks.
        </li>
      </ul>

      <h2>Known conflicts</h2>
      <ul>
        <li>Aeroporto: 45.5 m vs 18.95 m.</li>
        <li>Baixa-Chiado: 45 m vs 38.75 m.</li>
        <li>Olivais: 36 m vs 28.65 m.</li>
        <li>Campo de Ourique: 31 m vs about 35 m.</li>
        <li>Infante Santo: 29.5 m vs about 19 m.</li>
      </ul>

      <h2>Limitations</h2>
      <ul>
        <li>The current terrain is synthetic and illustrative. It is not a survey.</li>
        <li>Most platforms still have unknown depths.</li>
        <li>
          Campo Grande is treated as overground, following OSM layer tags and
          the published station description.
        </li>
        <li>Estimated tunnel profiles are approximate and are not measurements.</li>
        <li>The 3D terrain is illustrative; tunnel grades use the station DEM separately.</li>
        <li>Surface elevation is sampled at the station coordinate, not the surveyed entrance.</li>
      </ul>

      <p>
        The dataset version, attribution, and source notes are published in the
        map manifest.
      </p>
    </InfoPage>
  )
}
