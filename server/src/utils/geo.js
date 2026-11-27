// Distance helpers for "hospitals near me".

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

// Great-circle distance between two points, in kilometres (haversine formula).
export const distanceKm = (lat1, lng1, lat2, lng2) => {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
};

// A rectangle that fully contains the circle of `radiusKm` around a point.
// The database uses it to throw away far-away rows cheaply, before exact
// distances are worked out for the few rows that remain.
export const boundingBox = (lat, lng, radiusKm) => {
  const latDelta = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  // Degrees of longitude get shorter towards the poles.
  const lngDelta = latDelta / Math.max(Math.cos(toRadians(lat)), 0.01);

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
};