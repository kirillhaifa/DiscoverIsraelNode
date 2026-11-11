import { db } from '../config/firebase';
import { Locale, LocalizedText, MapPoint, Place, PlaceCard, PlacesFilter, PlaceTag, PlaceView } from '../types';
import { redisClient } from '../config/redis';
import { toLegacySlug, toSlug } from '../utils/slug';
import { distanceKm, normalizeToLngLat } from '../utils/geo';

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
    slug: toSlug(data.placeName?.en ?? ''),
    tags,
    religions: data.religions ?? [],
  } as Place;
}

export async function getAllPlaces(): Promise<Place[]> {
  // Проверяем Redis кэш
  const cached = await redisClient.get(CACHE_KEY);
  if (cached) {
    // slug не хранится в кэше, записанном до его появления
    return (JSON.parse(cached) as Place[]).map(p => (p.slug ? p : { ...p, slug: toSlug(p.placeName?.en ?? '') }));
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
    const tags = filters.tags;
    places = filters.tagsMatch === 'all'
      ? places.filter(p => tags.every(tag => p.tags.includes(tag)))
      : places.filter(p => tags.some(tag => p.tags.includes(tag)));
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

  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    const has = (t?: LocalizedText) => Object.values(t ?? {}).some(v => String(v).toLowerCase().includes(q));
    places = places.filter(p => has(p.placeName) || has(p.shortDescription) || p.region?.toLowerCase().includes(q));
  }

  if (filters.excludeIds?.length) {
    const exclude = new Set(filters.excludeIds);
    places = places.filter(p => !exclude.has(p.id));
  }

  if (filters.near) {
    const { lat, lng, radiusKm } = filters.near;
    places = places.filter(p => {
      const lngLat = normalizeToLngLat(p.coordinates);
      return !!lngLat && distanceKm(lat, lng, lngLat[1], lngLat[0]) <= radiusKm;
    });
  }

  if (filters.ids) {
    const byId = new Map(places.map(p => [p.id, p]));
    places = filters.ids.map(id => byId.get(id)).filter((p): p is Place => !!p);
  }

  return places;
}

/** Точки для карты: только id, координаты [lng, lat] и теги (размер точки фронт считает по тегам). Места с битыми координатами пропускаем. */
export function toMapPoints(places: Place[]): MapPoint[] {
  const points: MapPoint[] = [];
  for (const p of places) {
    const lngLat = normalizeToLngLat(p.coordinates);
    if (lngLat) points.push({ id: p.id, lngLat, tags: p.tags });
  }
  return points;
}

/** Место из кэша (тот же источник, что у списка); null — такого id нет */
export async function getCachedPlaceById(id: string): Promise<Place | null> {
  return (await getAllPlaces()).find(p => p.id === id) ?? null;
}

const LOCALIZED_FIELDS = ['placeName', 'shortDescription', 'extendedDescription'] as const;

/**
 * Готовит место к ответу: card убирает extendedDescription,
 * lang оставляет в текстах только этот язык и en (запасной, его показывает фронт без перевода).
 */
export function shapePlace(place: Place, view: PlaceView, lang?: Locale): Place | PlaceCard {
  const out: Record<string, unknown> = { ...place };
  if (view === 'card') delete out.extendedDescription;
  if (lang) {
    for (const field of LOCALIZED_FIELDS) {
      const text = place[field];
      if (field in out && text) {
        out[field] = { en: text.en, ...(text[lang] !== undefined ? { [lang]: text[lang] } : {}) };
      }
    }
  }
  return out as unknown as Place | PlaceCard;
}

/** Место по slug. Старый формат slug тоже находит: фронт сам редиректит на канонический адрес. */
export async function getPlaceBySlug(slug: string): Promise<Place | null> {
  const s = slug.toLowerCase();
  const places = await getAllPlaces();
  return places.find(p => p.slug === s) ?? places.find(p => toLegacySlug(p.placeName?.en ?? '') === s) ?? null;
}

/** id и slug всех мест — для generateStaticParams и sitemap */
export async function getPlaceSlugs(): Promise<{ id: string; slug: string; updatedAt?: string }[]> {
  const places = await getAllPlaces();
  return places.map(p => {
    const updatedAt = (p as Place & { updatedAt?: string }).updatedAt;
    return { id: p.id, slug: p.slug, ...(updatedAt ? { updatedAt } : {}) };
  });
}

export async function getPlaceById(id: string): Promise<Place | null> {
  const docRef = await db.collection('places').doc(id).get();
  if (!docRef.exists) return null;
  return normalizePlace(docRef.id, docRef.data()!);
}

/**
 * Создать новое место + сбросить полный кэш.
 */
export async function createPlace(input: Omit<Place, 'id' | 'slug'> & { slug?: string }): Promise<Place> {
  const { slug: _slug, ...data } = input; // slug считается из названия, в базу не пишем
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
  const { slug: _slug, ...rest } = fields; // slug считается из названия, в базу не пишем
  await db.collection('places').doc(id).update(rest);
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

/**
 * Удалить место + сбросить полный кэш. Возвращает false, если места нет.
 */
export async function deletePlace(id: string): Promise<boolean> {
  const docRef = db.collection('places').doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return false;

  await docRef.delete();
  await invalidatePlacesCache();
  return true;
}
