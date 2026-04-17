import { db } from '../config/firebase';
import { Place, PlacesFilter } from '../types';
import { redisClient } from '../config/redis';

const CACHE_KEY = 'places:all';
const CACHE_TTL = 60 * 60 * 24; // 24 часа

/**
 * Нормализует документ из Firestore в тип Place.
 * Поддерживает старый формат (parameters: {hiking: true})
 * и новый (tags: ['hiking']).
 */
function normalizePlace(id: string, data: FirebaseFirestore.DocumentData): Place {
  let tags: string[] = data.tags ?? [];
  if (tags.length === 0 && data.parameters && typeof data.parameters === 'object') {
    tags = Object.entries(data.parameters)
      .filter(([, v]) => v === true)
      .map(([k]) => k);
  }
  return {
    ...data,
    id,
    tags,
    religions: data.religions ?? [],
  } as Place;
}

export async function getAllPlaces(): Promise<Place[]> {
  // Проверяем Redis кэш
  const cached = await redisClient.get(CACHE_KEY);
  if (cached) {
    return JSON.parse(cached) as Place[];
  }

  // Cache miss — читаем из Firestore
  const snapshot = await db.collection('places').get();
  const places = snapshot.docs.map((doc) => normalizePlace(doc.id, doc.data()));

  // Сохраняем в Redis на 24ч
  await redisClient.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify(places));

  return places;
}

export async function invalidatePlacesCache(): Promise<void> {
  await redisClient.del(CACHE_KEY);
}

/**
 * Точечно обновляет одно место в Redis-кэше без полного сброса.
 * Используется после изменения рейтинга — не инвалидирует весь кэш.
 */
export async function updatePlaceInCache(
  placeId: string,
  fields: Partial<Pick<Place, 'averageRating' | 'ratingsCount' | 'ratingsSum'>>,
): Promise<void> {
  const cached = await redisClient.get(CACHE_KEY);
  if (!cached) return; // кэша нет — нечего обновлять, следующий запрос сам заполнит

  const places: Place[] = JSON.parse(cached);
  const idx = places.findIndex((p) => p.id === placeId);
  if (idx === -1) return;

  places[idx] = { ...places[idx], ...fields };
  await redisClient.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify(places));
}

export async function getPlaces(filters: PlacesFilter = {}): Promise<Place[]> {
  let places = await getAllPlaces();

  if (filters.region) {
    places = places.filter(p => p.region === filters.region);
  }

  if (filters.tags?.length) {
    places = places.filter(p => filters.tags!.some(tag => p.tags.includes(tag)));
  }

  if (filters.religions?.length) {
    places = places.filter(p => filters.religions!.some(r => p.religions.includes(r)));
  }

  if (filters.free) {
    places = places.filter(p =>
      p.tags.includes('free') ||
      p.ticketPrice?.adult === null ||
      p.ticketPrice?.adult === '0'
    );
  }

  if (filters.minRating !== undefined) {
    places = places.filter(p => (p.averageRating ?? 0) >= filters.minRating!);
  }

  if (filters.maxVisitTime !== undefined) {
    places = places.filter(p => p.minVisitTime <= filters.maxVisitTime!);
  }

  return places;
}

export async function getPlaceById(id: string): Promise<Place | null> {
  const docRef = await db.collection('places').doc(id).get();
  if (!docRef.exists) return null;
  return normalizePlace(docRef.id, docRef.data()!);
}

/**
 * Создать новое место + сбросить полный кэш.
 */
export async function createPlace(data: Omit<Place, 'id'>): Promise<Place> {
  const docRef = await db.collection('places').add(data);
  const place = normalizePlace(docRef.id, data as FirebaseFirestore.DocumentData);
  await invalidatePlacesCache(); // полный сброс — новый список будет запрошен при след запросе
  return place;
}

/**
 * Обновить произвольные поля места + точечно обновить кэш через updatePlaceInCache.
 */
export async function updatePlace(
  id: string,
  fields: Partial<Record<string, any>>
): Promise<Place> {
  await db.collection('places').doc(id).update(fields);
  const updated = await db.collection('places').doc(id).get();
  const place = normalizePlace(id, updated.data()!);

  // Точечно обновляем весь объект в кэше
  const cached = await redisClient.get(CACHE_KEY);
  if (cached) {
    const places: Place[] = JSON.parse(cached);
    const idx = places.findIndex((p) => p.id === id);
    if (idx !== -1) {
      places[idx] = place;
      await redisClient.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify(places));
    }
  }

  return place;
}
