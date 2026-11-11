# ParkPal Global Offline Maps

## Current state

ParkPal now exposes a local PMTiles archive endpoint. The map archive is optional:
the app remains usable without it, and `/api/map/status` reports whether it has
been installed.

- Archive path: `data/offline-map/world.pmtiles`
- Archive URL: `/maps/world.pmtiles`
- Status API: `/api/map/status`
- Manifest API: `/api/map/manifest`
- Storage budget: 20 GB (target ceiling, not a guarantee of global detail)

## Install a generated archive

1. Create `data/offline-map/` if it does not exist.
2. Place the generated PMTiles archive at `data/offline-map/world.pmtiles`.
3. Start ParkPal with `npm start`.
4. Open `http://localhost:3000/api/map/status`. It should return
   `"installed": true` and a non-zero `sizeBytes`.
5. Check that a byte-range request works:

   ```powershell
   curl.exe -I -H "Range: bytes=0-1023" http://localhost:3000/maps/world.pmtiles
   ```

   A successful range response should be HTTP `206 Partial Content`.

Do not commit the large archive to Git. Copy it to the local data folder or
distribute it separately on a drive with enough free space.

## Data and licensing

Use an OpenStreetMap-derived dataset and preserve the required
© OpenStreetMap contributors attribution and ODbL notices. Do not download,
cache, or redistribute Google Maps tiles as a substitute. OSM vector data
does not include Google-style satellite imagery, Street View, live traffic,
or guaranteed full global address search.

## Renderer integration

The current ParkPal frontend uses Leaflet. The backend archive endpoint is
renderer-neutral, but Leaflet cannot consume a PMTiles vector archive by
changing a tile URL alone. The next frontend phase must vendor compatible
PMTiles and map-renderer assets locally, wire a PMTiles protocol/source, and
preserve ParkPal's existing markers, route lines, popups, NEXUS pin workflow,
and NEXORA navigation visibility rules. No CDN should be required at runtime.

## 20 GB planning

Treat 20 GB as a hard storage budget for the map package, not a promise that
all places will have street-level detail. Generate a small regional test first,
measure its size and visual quality at each zoom, then scale the zoom/detail
profile to fit. A global archive should prioritize low-zoom coverage and
selectively retain high-detail urban areas. Satellite imagery and full global
address-level search require separate data budgets and licensing review.
