// utils/geo.ts
// Координаты мест: в базе встречаются и [lat, lng], и [lng, lat]. Та же эвристика во фронте: DiscoverIsraelNext/utils/geo.ts

const isInIsraelBounds = (lat: number, lng: number) => lat >= 29 && lat <= 34.8 && lng >= 34 && lng <= 36.4;

/** Определяет порядок координат и возвращает [lng, lat]; null — координаты битые */
export function normalizeToLngLat(coordinates: unknown): [number, number] | null {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
  const a = Number(coordinates[0]);
  const b = Number(coordinates[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (isInIsraelBounds(a, b)) return [b, a];
  if (isInIsraelBounds(b, a)) return [a, b];
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return [b, a];
  if (Math.abs(a) <= 180 && Math.abs(b) <= 90) return [a, b];
  return null;
}

/** Расстояние по прямой в км (гаверсинус) */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
