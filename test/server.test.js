// Lightweight API smoke tests using Node's built-in test runner.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = require('../server');

test('ParkPal server API', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await t.test('health endpoint responds with online status', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.status, 'online');
      assert.ok(body.appName);
    });

    await t.test('stations endpoint returns a valid collection', async () => {
      const response = await fetch(`${baseUrl}/api/stations`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data));
      assert.equal(body.count, body.data.length);
    });

    await t.test('web app is served from the public folder', async () => {
      const response = await fetch(`${baseUrl}/`);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /<html/i);
      assert.match(html, /ParkPal/i);
    });

    await t.test('registration rejects invalid map-pin coordinates', async () => {
      const response = await fetch(`${baseUrl}/api/stations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Invalid test pin', lat: 999, lng: 76.9 })
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(body.success, false);
      assert.match(body.message, /valid map-pin coordinates/i);
    });

    await t.test('registration saves the selected map-pin coordinates', async () => {
      const stationsFile = path.join(__dirname, '..', 'data', 'stations.json');
      const original = fs.readFileSync(stationsFile, 'utf8');
      try {
        const response = await fetch(`${baseUrl}/api/stations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'NEXUS pin test location', lat: 8.485395, lng: 76.987891,
            slots: 2, price: 'Free', type: ['car']
          })
        });
        const body = await response.json();

        assert.equal(response.status, 201);
        assert.equal(body.success, true);
        assert.equal(body.data.lat, 8.485395);
        assert.equal(body.data.lng, 76.987891);
        assert.equal(body.data.isApproved, true);
        assert.equal(body.data.approvalStatus, 'approved');

        const savedResponse = await fetch(`${baseUrl}/api/stations`);
        const savedBody = await savedResponse.json();
        assert.equal(savedBody.success, true);
        assert.ok(savedBody.data.some(st => st.name === 'NEXUS pin test location'));

        const scanResponse = await fetch(`${baseUrl}/api/stations/scan?lat=8.485395&lng=76.987891&radius=4`);
        const scanBody = await scanResponse.json();
        assert.equal(scanResponse.status, 200);
        assert.ok(scanBody.stations.every(st => st.isDemoData === true));

        const afterScanResponse = await fetch(`${baseUrl}/api/stations`);
        const afterScanBody = await afterScanResponse.json();
        assert.ok(afterScanBody.data.some(st => st.name === 'NEXUS pin test location'),
          'a demo scan must not remove the approved station from the saved registry');
      } finally {
        fs.writeFileSync(stationsFile, original, 'utf8');
      }
    });

    await t.test('city-wide POI endpoint reports the correct dataset state', async () => {
      const response = await fetch(`${baseUrl}/api/pois`);
      const body = await response.json();
      if (response.status === 503) {
        assert.equal(body.success, false);
        assert.equal(body.datasetNotLoaded, true);
        assert.match(body.message, /npm run import:trivandrum/);
      } else {
        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.ok(Array.isArray(body.data));
        assert.ok(Number.isInteger(body.count));
      }
    });

    await t.test('city-wide POI search supports filtering and pagination beyond four results', async () => {
      const poisFile = path.join(__dirname, '..', 'data', 'trivandrum-pois.json');
      const originalExists = fs.existsSync(poisFile);
      const original = originalExists ? fs.readFileSync(poisFile, 'utf8') : null;
      const features = Array.from({ length: 37 }, (_, index) => ({
        id: `test-${index + 1}`,
        name: `Trivandrum Test Place ${String(index + 1).padStart(2, '0')}`,
        category: index % 2 ? 'Shopping' : 'Food & Drink',
        lat: 8.48 + index / 10000,
        lng: 76.98 + index / 10000
      }));
      try {
        fs.writeFileSync(poisFile, JSON.stringify({
          source: 'OpenStreetMap contributors',
          attribution: '© OpenStreetMap contributors',
          region: 'Thiruvananthapuram city',
          count: features.length,
          features
        }), 'utf8');

        const first = await fetch(`${baseUrl}/api/pois?page=1&limit=30`);
        const firstBody = await first.json();
        assert.equal(first.status, 200);
        assert.equal(firstBody.count, 37);
        assert.equal(firstBody.data.length, 30);
        assert.equal(firstBody.hasMore, true);

        const second = await fetch(`${baseUrl}/api/pois?page=2&limit=30`);
        const secondBody = await second.json();
        assert.equal(secondBody.data.length, 7);
        assert.equal(secondBody.hasMore, false);

        const filtered = await fetch(`${baseUrl}/api/pois?q=Place%2001&category=Shopping`);
        const filteredBody = await filtered.json();
        assert.ok(filteredBody.data.every(item => item.category === 'Shopping'));
      } finally {
        if (originalExists) fs.writeFileSync(poisFile, original, 'utf8');
        else if (fs.existsSync(poisFile)) fs.unlinkSync(poisFile);
      }
    });

    await t.test('NEXUS no longer exposes the old OSM file-import endpoint', async () => {
      const response = await fetch(`${baseUrl}/api/nexus/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'sample.osm', content: '<osm></osm>' })
      });
      assert.equal(response.status, 404);
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

