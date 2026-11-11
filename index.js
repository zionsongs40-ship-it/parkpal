
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

module.exports = {
  calculateDistanceKm,
  findNearestAvailableStations
};
