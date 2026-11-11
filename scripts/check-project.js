// Basic project checks that work on Windows, macOS, and Linux.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const [major, minor] = process.versions.node.split('.').map(Number);
const nodeIsSupported = major > 18 || (major === 18 && minor >= 18);
let failed = false;

console.log(`NEXUS / ParkPal project check — Node.js ${process.versions.node}`);

if (!nodeIsSupported) {
  console.error('FAIL: Node.js 18.18.0 or newer is required.');
  failed = true;
} else {
  console.log('OK: Node.js version is supported.');
}

for (const relativePath of ['server.js', 'offline-map.js', 'data/offline-map/manifest.json', 'public/index.html', 'public/app.js', 'public/style.css', 'data/stations.json', 'data/trivandrum-pois.json', 'scripts/import-trivandrum-pois.js']) {
  const fullPath = path.join(root, relativePath);
  if (fs.existsSync(fullPath)) {
    console.log(`OK: ${relativePath}`);
  } else {
    console.error(`FAIL: Missing ${relativePath}`);
    failed = true;
  }
}

try {
  JSON.parse(fs.readFileSync(path.join(root, 'data/offline-map/manifest.json'), 'utf8'));
  console.log('OK: offline map manifest contains valid JSON.');
  JSON.parse(fs.readFileSync(path.join(root, 'data/stations.json'), 'utf8'));
  JSON.parse(fs.readFileSync(path.join(root, 'data/trivandrum-pois.json'), 'utf8'));
  console.log('OK: station registry and Trivandrum POI index contain valid JSON.');
} catch (error) {
  console.error(`FAIL: data/stations.json is not valid JSON (${error.message}).`);
  failed = true;
}

for (const dependency of ['express', 'cors']) {
  try {
    require.resolve(dependency, { paths: [root] });
    console.log(`OK: ${dependency} is installed.`);
  } catch {
    console.error(`FAIL: ${dependency} is missing. Run npm ci.`);
    failed = true;
  }
}


// Confirm the exhibition map defaults to the requested school location.
try {
  const frontend = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  const backend = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  if (frontend.includes('8.485395, 76.987891') &&
      frontend.includes("St. Mary's Central School") &&
      frontend.includes('DEFAULT_EXHIBITION_LOCATION')) {
    console.log('OK: school exhibition location is configured as the map default.');
  } else {
    console.error('FAIL: school exhibition default location is missing from public/app.js.');
    failed = true;
  }
  if (frontend.includes("fetch('/api/ip-location')")) {
    console.error('FAIL: startup still requests IP-based location instead of keeping the exhibition default.');
    failed = true;
  } else {
    console.log('OK: startup does not replace the school default with an IP lookup.');
  }
  const navigationShowsOnlyChosenStops =
    frontend.includes('state.isNavigating = active;') &&
    frontend.includes('setNavigationMode(true);') &&
    frontend.includes('setNavigationMode(false);') &&
    frontend.includes(`parkingList.innerHTML = '';`) &&
    frontend.includes(`scanBarContainer.style.display = active ? 'none' : '';`) &&
    frontend.includes('? state.navigationStations : filteredList') &&
    frontend.includes('state.navigationStations = [station]') &&
    frontend.includes('state.navigationStations = selectedStops');

  if (navigationShowsOnlyChosenStops) {
    console.log('OK: unrelated parking pins and nearby results are hidden during navigation; only chosen trip stops can remain visible.');
  } else {
    console.error('FAIL: navigation does not restrict parking markers to the chosen destination or trip stops.');
    failed = true;
  }

  const approvedStationPersistence =
    frontend.includes('async function loadApprovedCommunityStations()') &&
    frontend.includes("fetch('/api/stations')") &&
    frontend.includes('state.communityStations = [') &&
    frontend.includes('combineStationCollections();') &&
    backend.includes("approvalStatus: 'approved'") &&
    backend.includes('isApproved: true');

  if (approvedStationPersistence) {
    console.log('OK: approved community stations are reloaded from the Node.js registry and remain separate from generated demo scans.');
  } else {
    console.error('FAIL: approved community station persistence is incomplete.');
    failed = true;
  }
} catch (error) {
  console.error(`FAIL: Could not verify the exhibition map default (${error.message}).`);
  failed = true;
}


// Confirm NEXUS uses the existing map pin instead of requiring a location file.
try {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const frontend = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  const backend = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const pinWorkflow = html.includes('btnNexusPickOnMap') &&
    html.includes('nexusPinPickerBanner') &&
    html.includes('btnNexusConfirmPinPick') &&
    frontend.includes('confirmNexusMapPin') &&
    frontend.includes('updateNexusPinMarker') &&
    frontend.includes("body: JSON.stringify(payload)");
  const visiblePinPreview = html.includes('nexusPinPickerMessage') &&
    frontend.includes("pane: 'nexusPinPane'") &&
    frontend.includes("map.getPane('nexusPinPane').style.zIndex = 750") &&
    frontend.includes('bright red P pin') &&
    frontend.includes('btnNexusConfirmPinPick.disabled = false') &&
    fs.readFileSync(path.join(root, 'public/style.css'), 'utf8').includes('.nexus-map-pin {');
  const noFileImport = !html.includes('nexusLocationFile') &&
    !html.includes('accept=".osm') &&
    !frontend.includes('parseNexusOsm') &&
    !backend.includes('/api/nexus/import') &&
    !backend.includes('nexusImport');
  if (pinWorkflow && noFileImport && visiblePinPreview) {
    console.log('OK: NEXUS uses a prominent draggable map pin with a visible preview and confirmation step; no .osm or location-file upload is required.');
  } else {
    console.error('FAIL: NEXUS pin-only location workflow is incomplete or old file-import code remains.');
    failed = true;
  }
} catch (error) {
  console.error(`FAIL: Could not verify NEXUS map-pin workflow (${error.message}).`);
  failed = true;
}

if (failed) {
  console.error('\nProject check failed. Fix the items above and run npm run check again.');
  process.exitCode = 1;
} else {
  console.log('\nProject check passed. Run npm start to launch ParkPal.');
}


// Confirm Plan Trip uses the searchable city-wide POI API, not a four-option select.
try {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const frontend = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  const backend = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const importer = fs.readFileSync(path.join(root, 'scripts/import-trivandrum-pois.js'), 'utf8');
  const citywideTrip = html.includes('tripLocationSearch') &&
    html.includes('tripLocationResults') &&
    frontend.includes("fetch(`/api/pois?${params.toString()}`)") &&
    frontend.includes("limit: '30'") &&
    frontend.includes('Load more locations') &&
    backend.includes("app.get('/api/pois'") &&
    backend.includes('dataset.features') &&
    importer.includes('OpenStreetMap contributors') &&
    !/<select id="tripDestination">/.test(html);
  if (citywideTrip) {
    console.log('OK: Plan Trip searches the city POI index with categories and pagination; no fixed four-destination dropdown remains.');
  } else {
    console.error('FAIL: Plan Trip city-wide POI search is incomplete.');
    failed = true;
  }
} catch (error) {
  console.error(`FAIL: Could not verify city-wide Plan Trip (${error.message}).`);
  failed = true;
}

// Confirm NEXORA has real approved-station SCAN and route-corridor trip discovery.
try {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const frontend = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  const backend = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const engine = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
  const nexoraFlow =
    backend.includes("app.get('/api/nexora/find'") &&
    backend.includes("app.post('/api/nexora/along-route'") &&
    backend.includes("app.post('/api/route/multi'") &&
    engine.includes('findStationsAlongRoute') &&
    frontend.includes('/api/nexora/find?lat=') &&
    frontend.includes("fetch('/api/nexora/along-route'") &&
    frontend.includes("fetch('/api/route/multi'") &&
    frontend.includes('nexoraTripResults') &&
    html.includes('nexoraTripPanel') &&
    html.includes('Find Route Parking');
  if (nexoraFlow) {
    console.log('OK: NEXORA SCAN and multi-stop road-trip parking discovery are connected.');
  } else {
    console.error('FAIL: NEXORA SCAN or multi-stop road-trip discovery is incomplete.');
    failed = true;
  }
} catch (error) {
  console.error(`FAIL: Could not verify NEXORA route discovery (${error.message}).`);
  failed = true;
}
