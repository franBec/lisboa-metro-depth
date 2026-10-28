import { InfoPage } from '../components/InfoPage'

export function MethodRoute() {
  return (
    <InfoPage title="Method">
      <p>
        This map shows published station depths and estimated tunnel profiles for
        the Lisbon Metro. Every depth carries its provenance. Unknown values stay
        unknown, and the viewer never draws a guessed crossing.
      </p>

      <h2>Sources</h2>
      <ul>
        <li>Metropolitano de Lisboa GTFS: line shapes, stops, and timetable.</li>
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

      <h2>Limitations</h2>
      <ul>
        <li>The current terrain is synthetic and illustrative. It is not a survey.</li>
        <li>Most platforms still have unknown depths.</li>
        <li>Estimated tunnel profiles are approximate and are not measurements.</li>
      </ul>

      <p>
        The dataset version, attribution, and source notes are published in the
        map manifest.
      </p>
    </InfoPage>
  )
}
