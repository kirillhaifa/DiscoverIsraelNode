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
