# NEXUS + ParkPal map-pin integration

NEXUS is embedded in ParkPal's existing **Register Parking Station** modal. It is a map-pin assistant, not an OSM file importer and not a replacement registration system.

## How it works

1. Open the Register Parking Station modal.
2. Press **Pick on map**. The form temporarily closes so the map can receive a tap.
3. Tap the exact parking location. NEXUS places a green draggable pin and reopens the form.
4. Drag the pin to fine-tune it, or use **Use map center** to choose the current map center.
5. Press ParkPal's existing **Register Station** button. The frontend sends the pin's latitude and longitude to `POST /api/stations`, and ParkPal stores the new station in `data/stations.json`.

## Important distinction

NEXUS does not require or upload `.osm` files. OpenStreetMap data files are not used to select this registration location. The pin is selected directly on the existing ParkPal map. The repository's older `data/map.osm` file is left untouched as legacy data; it is not read by the NEXUS pin workflow.

## Current limitations

The map's current Leaflet library, map tiles, search, and route services still use online resources. This change makes NEXUS location selection pin-based; it does not by itself make the entire app offline-ready.

## Plan Trip city-wide search

Plan Trip is a separate ParkPal feature (not part of NEXUS registration). It no longer uses four hard-coded destinations. It searches the local `data/trivandrum-pois.json` index through `GET /api/pois`, with category filters and paginated results. Generate the index once while online with `npm run import:trivandrum`; thereafter POI search uses the local file. See `README.md` for coverage and OSM attribution notes.
