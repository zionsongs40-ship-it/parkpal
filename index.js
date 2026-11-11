
'use strict';

// NEXORA — ParkPal Parking Discovery Engine

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const toRadians = degrees => degrees * Math.PI / 180;
  const earthRadiusKm = 6371;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusKm *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestAvailableStations({
  lat,
  lng,
  stations = [],
  radiusKm = 2,
  limit = 5
}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Invalid search coordinates.');
  }

  return stations
    .filter(station =>
      station.isApproved === true &&
      station.approvalStatus === 'approved' &&
      station.isDemoData !== true &&
      Number(station.slotsAvailable) > 0
    )
    .map(station => {
      const stationLat = Number(station.lat ?? station.latitude);
      const stationLng = Number(
        station.lng ?? station.lon ?? station.longitude
      );

      if (!Number.isFinite(stationLat) ||
          !Number.isFinite(stationLng)) {
        return null;
      }

      const distanceKm = calculateDistanceKm(
        lat, lng, stationLat, stationLng
      );

      return { ...station, distanceKm };
    })
    .filter(station =>
      station !== null && station.distanceKm <= radiusKm
    )
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}


function findStationsAlongRoute({
  routeCoordinates,
  stations = [],
  corridorKm = 2,
  limit = 20
}) {
  if (!Array.isArray(routeCoordinates) ||
      routeCoordinates.length < 2 ||
      routeCoordinates.length > 5000) {
    throw new Error('A route with at least two coordinates is required.');
  }
  if (!Number.isFinite(corridorKm) || corridorKm <= 0 || corridorKm > 20) {
    throw new Error('Invalid route search corridor.');
  }

  const route = routeCoordinates.map(point => {
    const lat = Number(Array.isArray(point) ? point[0] : point && point.lat);
    const lng = Number(Array.isArray(point) ? point[1] : point && point.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error('The route contains an invalid coordinate.');
    }
    return { lat, lng };
  });

  const segmentLengths = [];
  let totalRouteKm = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const length = calculateDistanceKm(
      route[i].lat, route[i].lng, route[i + 1].lat, route[i + 1].lng
    );
    segmentLengths.push(length);
    totalRouteKm += length;
  }

  const approvedStations = stations.filter(station =>
    station &&
    station.isApproved === true &&
    station.approvalStatus === 'approved' &&
    station.isDemoData !== true &&
    Number(station.slotsAvailable) > 0
  );

  const matches = [];
  for (const station of approvedStations) {
    const stationLat = Number(station.lat ?? station.latitude);
    const stationLng = Number(station.lng ?? station.lon ?? station.longitude);
    if (!Number.isFinite(stationLat) || !Number.isFinite(stationLng) ||
        stationLat < -90 || stationLat > 90 ||
        stationLng < -180 || stationLng > 180) continue;

    const longitudeScale = 111.32 * Math.max(
      0.000001, Math.cos(stationLat * Math.PI / 180)
    );
    let bestDistanceKm = Infinity;
    let bestProgressKm = 0;
    let distanceBeforeSegmentKm = 0;

    for (let i = 0; i < route.length - 1; i += 1) {
      const start = route[i];
      const end = route[i + 1];
      const ax = (start.lng - stationLng) * longitudeScale;
      const ay = (start.lat - stationLat) * 110.574;
      const bx = (end.lng - stationLng) * longitudeScale;
      const by = (end.lat - stationLat) * 110.574;
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy;
      const fraction = lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
      const nearestX = ax + fraction * dx;
      const nearestY = ay + fraction * dy;
      const distanceKm = Math.hypot(nearestX, nearestY) / 1;
      if (distanceKm < bestDistanceKm) {
        bestDistanceKm = distanceKm;
        bestProgressKm = distanceBeforeSegmentKm +
          segmentLengths[i] * fraction;
      }
      distanceBeforeSegmentKm += segmentLengths[i];
    }

    if (bestDistanceKm <= corridorKm) {
      matches.push({
        ...station,
        distanceToRouteKm: Number(bestDistanceKm.toFixed(3)),
        routeProgress: totalRouteKm > 0 ? bestProgressKm / totalRouteKm : 0,
        routeOrderKm: Number(bestProgressKm.toFixed(3))
      });
    }
  }

  const safeLimit = Number.isInteger(limit) && limit > 0
    ? Math.min(limit, 100)
    : 20;

  return matches
    .sort((a, b) =>
      a.routeProgress - b.routeProgress ||
      a.distanceToRouteKm - b.distanceToRouteKm
    )
    .slice(0, safeLimit);
}

module.exports = {
  calculateDistanceKm,
  findNearestAvailableStations,
  findStationsAlongRoute
};
