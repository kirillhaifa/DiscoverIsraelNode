import { db } from '../config/firebase';
import { Locale, LocalizedText, MapPoint, Place, PlaceCard, PlacesFilter, PlaceTag, PlaceView } from '../types';
import { redisClient } from '../config/redis';
import { toLegacySlug, toSlug } from '../utils/slug';
import { distanceKm, normalizeToLngLat } from '../utils/geo';

const CACHE_KEY = 'places:all';
const CACHE_TTL = 60 * 60 * 24; // 24 часа
/** Версия списка мест: меняется при любой правке. Процессы сверяют её и перечитывают список только при смене */
const VERSION_KEY = 'places:version';
/** Как часто процесс сверяет версию с Redis. Свои правки процесс видит сразу, чужие — не позже чем через это время */
const VERSION_CHECK_MS = 2000;

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

/**
 * Список мест в памяти процесса: разбирается из Redis один раз на версию, а не на каждый запрос.
 * Массив и объекты общие для всех запросов — только читать (filter/map/копии), никогда не менять на месте.
 */
interface PlacesMemory {
  version: string;
  places: Place[];
  byId: Map<string, Place>;
  bySlug: Map<string, Place>;
}

let memory: PlacesMemory | null = null;
let checkedAt = 0;
let loading: Promise<PlacesMemory> | null = null;

/** Текст для поиска (название и краткое описание на всех языках + регион) в нижнем регистре — считается один раз на объект */
const searchTextCache = new WeakMap<Place, string>();
function searchText(p: Place): string {
  let text = searchTextCache.get(p);
  if (text === undefined) {
    const all = (t?: LocalizedText) => Object.values(t ?? {}).map(v => String(v)).join('\n');
    text = [all(p.placeName), all(p.shortDescription), p.region ?? ''].join('\n').toLowerCase();
    searchTextCache.set(p, text);
  }
  return text;
}

function buildMemory(version: string, places: Place[]): PlacesMemory {
  // slug не хранится в кэше, записанном до его появления
  const withSlug = places.map(p => (p.slug ? p : { ...p, slug: toSlug(p.placeName?.en ?? '') }));
  return {
    version,
    places: withSlug,
    byId: new Map(withSlug.map(p => [p.id, p])),
    bySlug: new Map(withSlug.map(p => [p.slug, p])),
  };
}

const newVersion = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Текущая версия из Redis; если её ещё нет (первый запуск) — создаём */
async function readVersion(): Promise<string> {
  const version = await redisClient.get(VERSION_KEY);
  if (version) return version;
  const created = newVersion();
  await redisClient.set(VERSION_KEY, created, { NX: true });
  return (await redisClient.get(VERSION_KEY)) ?? created;
}

async function loadMemory(version: string): Promise<PlacesMemory> {
  const cached = await redisClient.get(CACHE_KEY);
  if (cached) return buildMemory(version, JSON.parse(cached) as Place[]);

  // Cache miss — читаем из Firestore и кладём в Redis для остальных процессов
  const snapshot = await db.collection('places').get();
  const places = snapshot.docs.map((doc) => normalizePlace(doc.id, doc.data()));
  await redisClient.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify(places));
  return buildMemory(version, places);
}

async function getMemory(): Promise<PlacesMemory> {
  if (memory && Date.now() - checkedAt < VERSION_CHECK_MS) return memory;
  const version = await readVersion();
  checkedAt = Date.now();
  if (memory && memory.version === version) return memory;
  // одновременные запросы ждут одну загрузку, а не грузят каждый свою
  if (!loading) {
    loading = loadMemory(version)
      .then((m) => { memory = m; return m; })
      .finally(() => { loading = null; });
  }
  return loading;
}

/** Все места. Общий массив из памяти — не менять */
export async function getAllPlaces(): Promise<Place[]> {
  return (await getMemory()).places;
}

/**
 * Сохранить новый список: в Redis (для других процессов), новая версия, сразу в память этого процесса.
 * Redis-кэш не перечитывается: список берётся из памяти, поэтому правка не тянет мегабайты из Redis.
 */
async function savePlaces(places: Place[]): Promise<void> {
  const version = newVersion();
  await redisClient.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify(places));
  await redisClient.set(VERSION_KEY, version);
  memory = buildMemory(version, places);
  checkedAt = Date.now();
}

/** Полный сброс: следующий запрос перечитает места из Firestore */
export async function invalidatePlacesCache(): Promise<void> {
  await redisClient.del(CACHE_KEY);
  await redisClient.set(VERSION_KEY, newVersion());
  memory = null;
}

/** Записи в кэш идут по очереди: иначе две одновременные оценки взяли бы один и тот же список и вторая затёрла бы первую */
let writeQueue: Promise<unknown> = Promise.resolve();

/** Заменить одно место в кэше новым объектом (не меняя старый — его могут читать другие запросы) */
function replaceInCache(placeId: string, next: (old: Place) => Place): Promise<void> {
  const run = writeQueue.then(async () => {
    const { places, byId } = await getMemory();
    const old = byId.get(placeId);
    if (!old) return;
    const updated = next(old);
    await savePlaces(places.map((p) => (p.id === placeId ? updated : p)));
  });
  writeQueue = run.catch(() => {}); // ошибка одной записи не блокирует следующие
  return run;
}

/**
 * Точечно обновляет одно место в кэше без полного сброса.
 * Используется после изменения рейтинга — не инвалидирует весь кэш.
 */
export async function updatePlaceInCache(
  placeId: string,
  fields: Partial<Pick<Place, 'averageRating' | 'ratingsCount' | 'ratingsSum'>>,
): Promise<void> {
  await replaceInCache(placeId, (old) => ({ ...old, ...fields }));
}

/** Все теги, которые встречаются у мест — подсказки в редакторе тегов */
export async function getAllTags(): Promise<string[]> {
  const set = new Set<string>();
  for (const p of await getAllPlaces()) for (const tag of p.tags ?? []) set.add(tag);
  return [...set].sort();
}

/** Сортировка списка: rating — лучшие по оценке (только оценённые), popular — больше всего оценок */
export type PlacesSort = 'rating' | 'popular';

export function sortPlaces(places: Place[], sort: PlacesSort): Place[] {
  if (sort === 'rating') {
    return places
      .filter(p => typeof p.averageRating === 'number' && (p.ratingsCount ?? 0) > 0)
      .sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0) || (b.ratingsCount ?? 0) - (a.ratingsCount ?? 0));
  }
  return [...places].sort((a, b) => (b.ratingsCount ?? 0) - (a.ratingsCount ?? 0));
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
    places = places.filter(p => searchText(p).includes(q));
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
  return (await getMemory()).byId.get(id) ?? null;
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
  const { places, bySlug } = await getMemory();
  return bySlug.get(s) ?? places.find(p => toLegacySlug(p.placeName?.en ?? '') === s) ?? null;
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
 * Обновить произвольные поля места + точечно заменить его в кэше.
 */
export async function updatePlace(
  id: string,
  fields: Partial<Record<string, any>>
): Promise<Place> {
  const { slug: _slug, ...rest } = fields; // slug считается из названия, в базу не пишем
  await db.collection('places').doc(id).update(rest);
  const updated = await db.collection('places').doc(id).get();
  const place = normalizePlace(id, updated.data()!);

  // Точечно заменяем место в кэше (память, Redis, новая версия)
  await replaceInCache(id, () => place);

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
