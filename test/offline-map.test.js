'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { registerOfflineMapRoutes } = require('../offline-map');

test('offline map endpoints', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parkpal-offline-map-'));
  const mapDir = path.join(dataDir, 'offline-map');
  fs.mkdirSync(mapDir, { recursive: true });
  fs.writeFileSync(path.join(mapDir, 'manifest.json'), JSON.stringify({
    name: 'Test map',
    archive: 'world.pmtiles',
    format: 'PMTiles',
    budgetGB: 20,
    minZoom: 0,
    maxZoom: 14
  }));
  const app = express();
  registerOfflineMapRoutes(app, { express, dataDir });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await t.test('reports archive as not installed before file exists', async () => {
      const response = await fetch(`${baseUrl}/api/map/status`);
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.installed, false);
      assert.equal(body.budgetGB, 20);
    });

    await t.test('reports missing archive clearly', async () => {
      const response = await fetch(`${baseUrl}/maps/world.pmtiles`);
      const body = await response.json();
      assert.equal(response.status, 404);
      assert.equal(body.code, 'OFFLINE_MAP_NOT_INSTALLED');
    });

    await t.test('serves PMTiles byte ranges after archive is installed', async () => {
      const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
      fs.writeFileSync(path.join(mapDir, 'world.pmtiles'), bytes);
      const response = await fetch(`${baseUrl}/maps/world.pmtiles`, {
        headers: { Range: 'bytes=0-7' }
      });
      assert.equal(response.status, 206);
      assert.equal(response.headers.get('accept-ranges'), 'bytes');
      assert.equal(await response.text(), '01234567');
    });

    await t.test('manifest API reflects installed archive size', async () => {
      const response = await fetch(`${baseUrl}/api/map/manifest`);
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.installed, true);
      assert.equal(body.status, 'installed');
      assert.equal(body.archiveSizeBytes, 36);
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
