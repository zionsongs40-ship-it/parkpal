// ParkPal Node.js Backend Server
// Parking scan results are synthetic demo data generated for the requested location.

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const {
  findNearestAvailableStations,
  findStationsAlongRoute
} = require('./index');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'stations.json');
const POI_FILE = path.join(__dirname, 'data', 'trivandrum-pois.json');

// Middleware
app.use(cors());
app.use(express.json({ limit: '7mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Haversine distance formula (in km)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper: Read community stations database
function getStations() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const rawData = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(rawData);
  } catch (err) {
    return [];
  }
}

// Helper: Save community stations database
function saveStations(stations) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(stations, null, 2), 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

function createSeededRandom(seed) {
  let value = seed;
  return () => {
    value = (value + 0x6D2B79F5) | 0;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function generateDemoParking(lat, lng, radiusKm) {
  const seedInput = `${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusKm}`;
  let seed = 2166136261;
  for (const character of seedInput) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  }

  const random = createSeededRandom(seed >>> 0);
  const count = 20 + Math.floor(random() * 11);
  const parkingNames = [
    'City Center Demo Garage',
    'Riverside Demo Parking',
    'Market Square Demo Lot',
    'Central Demo Parking',
    'Northside Demo Garage',
    'Transit Hub Demo Lot',
    'Lakeside Demo Parking',
    'Civic Center Demo Garage',
    'West End Demo Lot',
    'Harbor View Demo Parking'
  ];

  return Array.from({ length: count }, (_, index) => {
    const distanceKm = Math.sqrt(random()) * radiusKm;
    const bearing = random() * Math.PI * 2;
    const latOffset = distanceKm * Math.cos(bearing) / 111.32;
    const longitudeScale = Math.max(0.01, Math.cos(lat * Math.PI / 180));
    const lngOffset = distanceKm * Math.sin(bearing) / (111.32 * longitudeScale);
    const totalSlots = 30 + Math.floor(random() * 91);
    const slotsAvailable = 1 + Math.floor(random() * totalSlots);
    const isFree = random() < 0.3;
    const type = ['car'];

    if (random() < 0.35) type.push('bike');
    if (random() < 0.2) type.push('ev');

    return {
      id: `demo-${seed >>> 0}-${index + 1}`,
      name: `${parkingNames[index % parkingNames.length]} ${String(index + 1).padStart(2, '0')}`,
      lat: Math.max(-89.999, Math.min(89.999, lat + latOffset)),
      lng: ((lng + lngOffset + 180) % 360 + 360) % 360 - 180,
      slotsAvailable,
      totalSlots,
      price: isFree ? 'Free' : 'Paid',
      rate: isFree ? 'Demo rate: Free' : `Demo rate: $${1 + Math.floor(random() * 5)}/hr`,
      type,
      source: 'ParkPal Demo Generator',
      availability: 'simulated',
      isDemoData: true
    };
  });
}

// ================= API ENDPOINTS ================= //

// 1. Health & Server Info
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    appName: 'ParkPal Global Demo',
    version: '4.0.0',
    parkingData: 'simulated exhibition data',
    timestamp: new Date().toISOString()
  });
});

// 1.1 Live Device / IP Location Detection
app.get('/api/ip-location', async (req, res) => {
  try {
    const response = await fetch('http://ip-api.com/json/', { signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const data = await response.json();
      if (data && data.lat && data.lon) {
        return res.json({
          success: true,
          city: data.city,
          region: data.regionName,
          lat: data.lat,
          lng: data.lon
        });
      }
    }
  } catch (err) {}

  res.json({
    success: true,
    city: "Poojappura, Thiruvananthapuram",
    region: "Kerala",
    lat: 8.485395,
    lng: 76.987891
  });
});

// 2. GET /api/stations - Returns registered community stations
app.get('/api/stations', (req, res) => {
  const stations = getStations();
  res.json({ success: true, count: stations.length, data: stations });
});

// NEXORA — Find the 5 nearest approved, available parking stations
app.get('/api/nexora/find', (req, res) => {
  const { lat, lng } = req.query;

  // Require a selected map-pin location
  if (typeof lat !== 'string' || typeof lng !== 'string' ||
      !lat.trim() || !lng.trim()) {
    return res.status(400).json({
      success: false,
      agent: 'NEXORA',
      message: 'A valid map-pin location is required.'
    });
  }

  const latitude = Number(lat);
  const longitude = Number(lng);

  // Validate latitude and longitude
  if (!Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180) {
    return res.status(400).json({
      success: false,
      agent: 'NEXORA',
      message: 'Invalid coordinates.'
    });
  }

  try {
    const stations = getStations();

    // Find approved, non-demo, available stations within 2 km
    const results = findNearestAvailableStations({
      lat: latitude,
      lng: longitude,
      stations,
      radiusKm: 2,
      limit: 5
    });

    return res.json({
      success: true,
      agent: 'NEXORA',
      searchCenter: {
        lat: latitude,
        lng: longitude
      },
      radiusKm: 2,
      limit: 5,
      count: results.length,
      stations: results,
      message: results.length
        ? `NEXORA found ${results.length} available approved parking station(s).`
        : 'No approved available parking stations found within 2 km.'
    });

  } catch (error) {
    console.error('[NEXORA]', error);

    return res.status(500).json({
      success: false,
      agent: 'NEXORA',
      message: 'NEXORA could not complete the parking search.'
    });
  }
});


// NEXORA — Find approved, available parking stations near a planned road route.
app.post('/api/nexora/along-route', (req, res) => {
  const routeCoordinates = req.body && req.body.routeCoordinates;
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
    return res.status(400).json({
      success: false,
      agent: 'NEXORA',
      message: 'A valid planned route is required.'
    });
  }

  try {
    const stations = findStationsAlongRoute({
      routeCoordinates,
      stations: getStations(),
      corridorKm: 2,
      limit: 20
    });
    return res.json({
      success: true,
      agent: 'NEXORA',
      corridorKm: 2,
      count: stations.length,
      stations,
      message: stations.length
        ? `NEXORA found ${stations.length} approved available station(s) along the route.`
        : 'No approved available parking stations were found within 2 km of this route.'
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      agent: 'NEXORA',
      message: error.message || 'NEXORA could not inspect this route.'
    });
  }
});

// ParkPal — Build one route through the selected parking stops and final destination.
app.post('/api/route/multi', async (req, res) => {
  const waypoints = req.body && req.body.waypoints;
  if (!Array.isArray(waypoints) || waypoints.length < 2 || waypoints.length > 8) {
    return res.status(400).json({
      success: false,
      message: 'Provide between 2 and 8 route waypoints.'
    });
  }

  const validWaypoints = waypoints.map(point => {
    const lat = Number(Array.isArray(point) ? point[0] : point && point.lat);
    const lng = Number(Array.isArray(point) ? point[1] : point && point.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
      ? [lat, lng]
      : null;
  });

  if (validWaypoints.some(point => point === null)) {
    return res.status(400).json({
      success: false,
      message: 'One or more route waypoints have invalid coordinates.'
    });
  }

  try {
    const coordinates = validWaypoints
      .map(([lat, lng]) => `${lng},${lat}`)
      .join(';');
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
    const response = await fetch(osrmUrl, {
      headers: { 'User-Agent': 'ParkPal-App/2.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (response.ok) {
      const data = await response.json();
      if (data.routes && data.routes.length) {
        const route = data.routes[0];
        return res.json({
          success: true,
          source: 'osrm',
          distanceKm: Number((route.distance / 1000).toFixed(1)),
          durationMinutes: Math.max(1, Math.round(route.duration / 60)),
          coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng])
        });
      }
    }
  } catch (error) {
    // The local straight-line fallback below keeps the itinerary usable offline.
  }

  let distanceKm = 0;
  for (let i = 0; i < validWaypoints.length - 1; i += 1) {
    distanceKm += calculateDistance(
      validWaypoints[i][0], validWaypoints[i][1],
      validWaypoints[i + 1][0], validWaypoints[i + 1][1]
    );
  }
  return res.json({
    success: true,
    source: 'straight-line-fallback',
    distanceKm: Number(distanceKm.toFixed(1)),
    durationMinutes: Math.max(1, Math.round((distanceKm / 30) * 60)),
    coordinates: validWaypoints
  });
});


// 3. GET /api/stations/scan - Generate 20-30 demo parking stations anywhere in the world
app.get('/api/stations/scan', async (req, res) => {
  const userLat = Number(req.query.lat);
  const userLng = Number(req.query.lng);
  const requestedRadius = Number(req.query.radius);
  const radiusKm = Number.isFinite(requestedRadius) && requestedRadius > 0
    ? Math.min(requestedRadius, 10)
    : 4;

  if (!Number.isFinite(userLat) || !Number.isFinite(userLng) ||
      userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180) {
    return res.status(400).json({ success: false, message: 'Valid lat & lng required' });
  }

  const demoStations = generateDemoParking(userLat, userLng, radiusKm);
  const results = demoStations.map(st => {
    const distKm = calculateDistance(userLat, userLng, st.lat, st.lng);
    const distMeters = Math.round(distKm * 1000);
    const formattedDist = distMeters < 1000 ? `${distMeters} m` : `${distKm.toFixed(1)} km`;

    return {
      ...st,
      distanceKm: distKm,
      distMeters: distMeters,
      distance: formattedDist
    };
  })
  .sort((a, b) => a.distanceKm - b.distanceKm);

  res.json({
    success: true,
    centerGPS: { lat: userLat, lng: userLng },
    radiusScannedKm: radiusKm,
    dataMode: 'demo',
    foundCount: results.length,
    stations: results
  });
});

// 4. POST /api/stations - Register new community parking station
app.post('/api/stations', (req, res) => {
  const { name, lat, lng, slots, price, rate, type } = req.body;

  const latitude = Number(lat);
  const longitude = Number(lng);
  if (typeof name !== 'string' || !name.trim() || !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) || latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180) {
    return res.status(400).json({ success: false, message: 'A station name and valid map-pin coordinates are required.' });
  }

  const stations = getStations();
  const newStation = {
    id: Date.now(),
    name: name.trim(),
    lat: latitude,
    lng: longitude,
    slotsAvailable: parseInt(slots) || 2,
    totalSlots: parseInt(slots) || 2,
    price: price || 'Free',
    rate: rate || (price === 'Free' ? 'Totally Free (Community)' : '₹20/hr'),
    type: Array.isArray(type) && type.length ? type : ['car'],
    isRegisteredCommunity: true,
    isRealWorldSpot: false,
    isApproved: true,
    approvalStatus: 'approved',
    isDemoData: false,
    createdAt: new Date().toISOString()
  };


  stations.unshift(newStation);
  if (!saveStations(stations)) {
    return res.status(500).json({ success: false, message: 'Could not save the community station.' });
  }

  res.status(201).json({
    success: true,
    message: `Parking station "${newStation.name}" registered successfully!`,
    data: newStation
  });
});

// 4.1 GET /api/pois - Search the imported city-wide Thiruvananthapuram POI index.
app.get('/api/pois', (req, res) => {
  let dataset;
  try {
    dataset = JSON.parse(fs.readFileSync(POI_FILE, 'utf8'));
  } catch (error) {
    return res.status(503).json({
      success: false,
      datasetNotLoaded: true,
      message: 'The Trivandrum locations index has not been imported yet. Run npm run import:trivandrum while online.'
    });
  }

  const all = Array.isArray(dataset.features) ? dataset.features : [];
  if (!all.length) {
    return res.status(503).json({
      success: false,
      datasetNotLoaded: true,
      message: 'The Trivandrum locations index is empty. Connect to the internet once and run npm run import:trivandrum. The imported data will then be searchable offline.'
    });
  }
  const query = String(req.query.q || '').trim().toLocaleLowerCase();
  const category = String(req.query.category || '').trim().toLocaleLowerCase();
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 30)));

  const filtered = all.filter(poi => {
    const text = `${poi.name || ''} ${poi.category || ''} ${poi.subtype || ''} ${poi.address || ''}`.toLocaleLowerCase();
    const matchesQuery = !query || text.includes(query);
    const matchesCategory = !category || category === 'all' ||
      String(poi.category || '').toLocaleLowerCase() === category;
    return matchesQuery && matchesCategory;
  });

  const start = (page - 1) * limit;
  res.json({
    success: true,
    region: dataset.region || 'Thiruvananthapuram city',
    source: dataset.source || 'OpenStreetMap contributors',
    attribution: dataset.attribution || '© OpenStreetMap contributors',
    datasetUpdatedAt: dataset.generatedAt || null,
    datasetCount: all.length,
    count: filtered.length,
    page,
    limit,
    hasMore: start + limit < filtered.length,
    categories: Array.from(new Set(all.map(poi => poi.category).filter(Boolean))).sort(),
    data: filtered.slice(start, start + limit)
  });
});

// 5. GET /api/route - Real Road Driving Route Proxy (OSRM)
app.get('/api/route', async (req, res) => {
  const { startLat, startLng, endLat, endLng } = req.query;

  if (!startLat || !startLng || !endLat || !endLng) {
    return res.status(400).json({ success: false, message: 'Start and end coordinates required' });
  }

  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
    const response = await fetch(osrmUrl, {
      headers: { 'User-Agent': 'ParkPal-App/2.0' },
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distKm = (route.distance / 1000).toFixed(1);
        const durationMins = Math.max(1, Math.round(route.duration / 60));

        return res.json({
          success: true,
          source: 'osrm',
          distanceKm: distKm,
          durationMinutes: durationMins,
          coordinates: route.geometry.coordinates.map(coord => [coord[1], coord[0]])
        });
      }
    }
  } catch (err) {}

  // Honest offline fallback: this is a straight-line preview, not road navigation.
  const fallbackDistanceKm = calculateDistance(
    Number(startLat), Number(startLng), Number(endLat), Number(endLng)
  );
  res.json({
    success: true,
    source: 'straight-line-fallback',
    distanceKm: fallbackDistanceKm.toFixed(1),
    durationMinutes: Math.max(1, Math.round((fallbackDistanceKm / 30) * 60)),
    coordinates: [
      [Number(startLat), Number(startLng)],
      [Number(endLat), Number(endLng)]
    ]
  });
});

// 6. GET /api/search - Real Global Address & Landmark Search Proxy
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json({ success: true, results: [] });

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ParkPal-App/2.0' },
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok) {
      const data = await response.json();
      const results = data.map(item => ({
        name: item.display_name.split(',')[0],
        fullName: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        type: item.type || 'place'
      }));
      return res.json({ success: true, results });
    }
  } catch (err) {}
  res.json({ success: true, results: [] });
});

// Start the HTTP server only when this file is run directly.
// This also lets tests and other Node.js tools safely import the Express app.
if (require.main === module) {
  const server = app.listen(PORT, () => {
    const address = server.address();
    const activePort = address && typeof address === 'object' ? address.port : PORT;

    console.log('====================================================');
    console.log(`ParkPal server running at: http://localhost:${activePort}`);
    console.log('NEXUS file/location workflow is ready.');
    console.log('====================================================');
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Close the other app or set a different PORT.`);
    } else {
      console.error('ParkPal could not start:', error.message);
    }
    process.exitCode = 1;
  });
}

module.exports = app;
