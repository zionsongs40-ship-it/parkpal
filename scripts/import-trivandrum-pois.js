#!/usr/bin/env node
'use strict';

// Build a city-wide, searchable POI index from OpenStreetMap.
// Run once while online: npm run import:trivandrum
const fs = require('node:fs');
const path = require('node:path');

const OUTPUT = path.join(__dirname, '..', 'data', 'trivandrum-pois.json');
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

const POI_KEYS = [
  'amenity', 'tourism', 'leisure', 'shop', 'historic', 'healthcare',
  'public_transport', 'railway', 'office', 'craft', 'emergency',
  'natural', 'sport', 'place'
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function overpass(query) {
  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'User-Agent': 'ParkPal-NEXUS/1.0 (educational city POI importer)'
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(90000)
        });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return await response.json();
      } catch (error) {
        lastError = error;
        await sleep(1200 * (attempt + 1));
      }
    }
  }
  throw new Error(`All Overpass servers failed: ${lastError ? lastError.message : 'unknown error'}`);
}

function chooseBoundary(elements) {
  const candidates = (elements || []).filter(item =>
    item.type === 'relation' &&
    item.tags &&
    item.tags.boundary === 'administrative' &&
    /^(thiruvananthapuram|trivandrum)$/i.test(item.tags.name || '')
  );
  // Prefer the municipal/corporation level when mapped; otherwise use the
  // most specific matching administrative relation returned by OSM.
  const rank = item => {
    const level = Number(item.tags.admin_level);
    if (level === 8) return 0;
    if (level === 7) return 1;
    if (level === 6) return 2;
    return 3;
  };
  candidates.sort((a, b) => rank(a) - rank(b));
  return candidates[0] || null;
}

function categoryFor(tags) {
  const groups = [
    ['Food & Drink', ['amenity', ['restaurant','cafe','fast_food','food_court','bar','pub','ice_cream'] ]],
    ['Shopping', ['shop', null]],
    ['Tourism & Attractions', ['tourism', null]],
    ['Parks & Recreation', ['leisure', null]],
    ['History & Culture', ['historic', null]],
    ['Health', ['healthcare', null]],
    ['Transport', ['public_transport', null]],
    ['Transport', ['railway', ['station','halt','tram_stop'] ]],
    ['Transport', ['amenity', ['bus_station','bus_stop','ferry_terminal','taxi'] ]],
    ['Education', ['amenity', ['school','college','university','library','kindergarten'] ]],
    ['Public Services', ['amenity', ['police','fire_station','post_office','townhall','courthouse','community_centre'] ]],
    ['Finance', ['amenity', ['bank','atm','bureau_de_change'] ]],
    ['Places of Worship', ['amenity', ['place_of_worship'] ]],
    ['Sports', ['sport', null]],
    ['Nature', ['natural', null]],
    ['Other Places', ['office', null]],
    ['Other Places', ['craft', null]],
    ['Other Places', ['place', null]]
  ];
  for (const [label, rule] of groups) {
    const key = rule[0];
    const allowed = rule[1];
    if (Object.prototype.hasOwnProperty.call(tags, key) &&
        (allowed === null || allowed.includes(tags[key]))) return label;
  }
  return 'Other Places';
}

function toPoi(element) {
  const tags = element.tags || {};
  const center = element.center || element;
  const lat = Number(center.lat);
  const lon = Number(center.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const name = String(tags.name || tags['name:en'] || tags['name:ml'] || '').trim();
  if (!name) return null;
  const matchedKey = POI_KEYS.find(key => tags[key] !== undefined);
  return {
    id: `osm-${element.type}-${element.id}`,
    osmType: element.type,
    osmId: element.id,
    name,
    category: categoryFor(tags),
    subtype: matchedKey ? `${matchedKey}=${tags[matchedKey]}` : 'place',
    lat,
    lng: lon,
    address: [tags['addr:street'], tags['addr:suburb'], tags['addr:city']]
      .filter(Boolean).join(', '),
    website: tags.website || tags['contact:website'] || '',
    phone: tags.phone || tags['contact:phone'] || '',
    source: 'OpenStreetMap'
  };
}

async function main() {
  console.log('Looking up the Thiruvananthapuram administrative boundary…');
  const boundaryData = await overpass(
    '[out:json][timeout:45];relation["boundary"="administrative"]["name"~"^(Thiruvananthapuram|Trivandrum)$",i];out tags;'
  );
  const boundary = chooseBoundary(boundaryData.elements);
  if (!boundary) {
    throw new Error('Could not find a named Thiruvananthapuram/Trivandrum administrative boundary in OSM. No output was overwritten.');
  }

  const areaId = Number(boundary.id) + 3600000000;
  const keyQueries = POI_KEYS.map(key => `nwr(area.city)["${key}"]["name"];`).join('\n');
  const query = `[out:json][timeout:180];area(${areaId})->.city;(${keyQueries});out center tags;`;
  console.log(`Downloading named POIs inside ${boundary.tags.name} (admin_level ${boundary.tags.admin_level || 'unspecified'})…`);
  const data = await overpass(query);
  const unique = new Map();
  for (const element of data.elements || []) {
    const poi = toPoi(element);
    if (poi) unique.set(poi.id, poi);
  }
  const features = Array.from(unique.values()).sort((a, b) =>
    a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
  );
  if (!features.length) throw new Error('OSM returned no named POIs. Existing dataset was not overwritten.');

  const output = {
    source: 'OpenStreetMap contributors',
    license: 'ODbL-1.0',
    attribution: '© OpenStreetMap contributors',
    region: 'Thiruvananthapuram city, Kerala, India',
    boundary: {
      osmType: boundary.type,
      osmId: boundary.id,
      name: boundary.tags.name,
      adminLevel: boundary.tags.admin_level || null
    },
    generatedAt: new Date().toISOString(),
    count: features.length,
    features
  };

  const temporary = `${OUTPUT}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(output), 'utf8');
  fs.renameSync(temporary, OUTPUT);
  console.log(`Saved ${features.length} named city locations to ${OUTPUT}`);
  console.log('Attribution: © OpenStreetMap contributors (ODbL).');
}

main().catch(error => {
  console.error(`POI import failed: ${error.message}`);
  process.exitCode = 1;
});
