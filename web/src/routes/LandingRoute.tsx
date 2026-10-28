import { Link } from 'react-router'

export function LandingRoute() {
  return (
    <main className="landing-root">
      <div className="shell">
        <header className="masthead">
          <p className="eyebrow">Underground Atlas</p>
          <h1>Maps below the surface.</h1>
          <p className="standfirst">
            Measured and published depths of underground railways, set inside the
            terrain they pass through. Every value carries its source.
          </p>
        </header>

        <section className="map-index" aria-labelledby="maps-title">
          <div className="section-head">
            <h2 id="maps-title">Maps</h2>
            <span className="count">01</span>
          </div>

          <Link className="map-card" to="/maps/lisboa/">
            <span className="map-visual" aria-hidden="true">
              <span className="contour contour-a"></span>
              <span className="contour contour-b"></span>
              <span className="contour contour-c"></span>
              <span className="river"></span>
              <span className="line line-blue"></span>
              <span className="line line-yellow"></span>
              <span className="line line-green"></span>
              <span className="line line-red"></span>
            </span>
            <span className="map-copy">
              <strong>Lisboa</strong>
              <span>Metropolitano de Lisboa, 44.5 km across four lines.</span>
              <span className="map-meta">3D terrain slab &middot; local demo &middot; 2026</span>
            </span>
            <span className="open-mark" aria-hidden="true">
              Open
            </span>
          </Link>
        </section>

        <footer className="credits">
          <p>
            Data: Metropolitano de Lisboa GTFS and Open-Meteo elevation samples
            based on Copernicus DEM. The web viewer uses a synthetic terrain
            placeholder while the depth survey is pending. OpenStreetMap arrives
            with the real basemap.
          </p>
          <p>Built by Franco. No tracking, no cookies, no API keys.</p>
        </footer>
      </div>
    </main>
  )
}
