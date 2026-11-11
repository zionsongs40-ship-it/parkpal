'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findStationsAlongRoute } = require('../index');

const route = [
  [0, 0],
  [0, 0.5],
  [0, 1]
];

test('NEXORA finds approved available stations within 2 km of a route', () => {
  const stations = [
    {
      id: 'later',
      name: 'Later Stop',
      lat: 0.001,
      lng: 0.8,
      slotsAvailable: 3,
      isApproved: true,
      approvalStatus: 'approved',
      isDemoData: false
    },
    {
      id: 'earlier',
      name: 'Earlier Stop',
      lat: 0.001,
      lng: 0.2,
      slotsAvailable: 2,
      isApproved: true,
      approvalStatus: 'approved',
      isDemoData: false
    },
    {
      id: 'too-far',
      lat: 0.05,
      lng: 0.5,
      slotsAvailable: 5,
      isApproved: true,
      approvalStatus: 'approved',
      isDemoData: false
    },
    {
      id: 'demo',
      lat: 0,
      lng: 0.3,
      slotsAvailable: 5,
      isApproved: true,
      approvalStatus: 'approved',
      isDemoData: true
    },
    {
      id: 'full',
      lat: 0,
      lng: 0.4,
      slotsAvailable: 0,
      isApproved: true,
      approvalStatus: 'approved',
      isDemoData: false
    },
    {
      id: 'pending',
      lat: 0,
      lng: 0.6,
      slotsAvailable: 4,
      isApproved: true,
      approvalStatus: 'pending',
      isDemoData: false
    }
  ];

  const results = findStationsAlongRoute({
    routeCoordinates: route,
    stations,
    corridorKm: 2,
    limit: 20
  });

  assert.deepEqual(results.map(station => station.id), ['earlier', 'later']);
  assert.ok(results.every(station => station.distanceToRouteKm <= 2));
  assert.ok(results[0].routeProgress < results[1].routeProgress);
});

test('NEXORA rejects invalid route coordinates', () => {
  assert.throws(() => findStationsAlongRoute({
    routeCoordinates: [[0, 0], [91, 0]],
    stations: []
  }), /invalid coordinate/i);
});

test('NEXORA requires at least two route coordinates', () => {
  assert.throws(() => findStationsAlongRoute({
    routeCoordinates: [[0, 0]],
    stations: []
  }), /at least two coordinates/i);
});
