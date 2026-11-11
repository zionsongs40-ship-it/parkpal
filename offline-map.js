'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Registers local-only endpoints for ParkPal's optional PMTiles world archive.
 * Express static serves byte-range requests, allowing PMTiles clients to read
 * only the archive sections they need instead of loading the complete file.
 */
function registerOfflineMapRoutes(app, options = {}) {
  const express = options.express || require('express');
  const dataDir = options.dataDir || path.join(__dirname, 'data');
  const mapDir = path.join(dataDir, 'offline-map');
  const archivePath = path.join(mapDir, 'world.pmtiles');
  const manifestPath = path.join(mapDir, 'manifest.json');

  function readManifest() {
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      return {
        name: 'ParkPal Global Offline Map',
        version: 1,
        status: 'not-installed',
        archive: 'world.pmtiles',
        format: 'PMTiles'
      };
    }
  }

  function archiveStats() {
    try {
      const stats = fs.statSync(archivePath);
      return stats.isFile() ? stats : null;
    } catch (error) {
      return null;
    }
  }

  app.get('/api/map/status', (req, res) => {
    const stats = archiveStats();
    const manifest = readManifest();

    res.json({
      success: true,
      installed: Boolean(stats),
      archive: manifest.archive || 'world.pmtiles',
      format: manifest.format || 'PMTiles',
      sizeBytes: stats ? stats.size : 0,
      sizeGB: stats ? Number((stats.size / (1024 ** 3)).toFixed(2)) : 0,
      budgetGB: Number(manifest.budgetGB || 20),
      maxZoom: manifest.maxZoom ?? null,
      minZoom: manifest.minZoom ?? 0,
      source: manifest.source || 'OpenStreetMap-derived data',
      message: stats
        ? 'Offline map archive is installed.'
        : 'Offline map archive has not been installed yet.'
    });
  });

  app.get('/api/map/manifest', (req, res) => {
    const manifest = readManifest();
    const stats = archiveStats();

    res.json({
      success: true,
      ...manifest,
      installed: Boolean(stats),
      archiveSizeBytes: stats ? stats.size : 0
    });
  });

  app.get('/maps/world.pmtiles', (req, res, next) => {
    if (!archiveStats()) {
      return res.status(404).json({
        success: false,
        code: 'OFFLINE_MAP_NOT_INSTALLED',
        message: 'Install data/offline-map/world.pmtiles to enable the offline world map.'
      });
    }
    return next();
  });

  // express.static supports HTTP Range requests by default. PMTiles uses
  // these requests to fetch archive metadata and individual tile sections.
  app.use('/maps', express.static(mapDir, {
    fallthrough: true,
    acceptRanges: true,
    index: false,
    maxAge: 0,
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  }));
}

module.exports = { registerOfflineMapRoutes };
