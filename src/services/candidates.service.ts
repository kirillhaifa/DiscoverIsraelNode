import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { LOCALES, LocalizedText, Place } from '../types';
import { getAllPlaces, invalidatePlacesCache } from './places.service';
import { invalidateCollectionsCache } from './collections.service';

const COLLECTION = 'placeCandidates';
// Вкладки админки: «На модерации» (английский текст), «Готово к переводу» (одобрены, ждут перевода)
// и «Финальная проверка» (с переводами)
export const MODERATION_STATUSES = ['moderation', 'ready_for_translation', 'translated'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];
// Куда можно перейти и откуда. Те же правила в tools/place-pipeline/review-server.mjs.
// Из translated место уходит публикацией: publishCandidate, статус published.
export const MODERATION_MOVES: Record<string, string[]> = {
  moderation: ['ready_for_translation'],
  ready_for_translation: ['moderation'],
  rejected_admin: ['moderation', 'ready_for_translation', 'translated'],
};

// Языки перевода: всё, кроме английского, он берётся из write и factcheck.
// Формат stages.translate.languages[lang]: { placeName, shortDescription, extendedDescription }.
const TRANSLATED_LOCALES = LOCALES.filter((l) => l !== 'en');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// season из этапа тегов: cool — октябрь–апрель, warm — май–октябрь, all — весь год
const SEASON_MONTHS: Record<string, number[]> = {
  all: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  cool: [0, 1, 2, 3, 9, 10, 11],
  warm: [4, 5, 6, 7, 8, 9],
};

/** Карточка места для вкладок модерации. Те же поля, что отдаёт локальный review-server. */
function toModerationCard(id: string, d: FirebaseFirestore.DocumentData) {
  const { value, photos, factcheck, write, tags, collections, validate, verify, territory, translate } = d.stages;
  return {
    id,
    status: d.status,
    kind: d.kind,
    tier: d.tier,
    region: d.region,
    coordinates: d.coordinates,
    placeName: write.placeName,
    shortDescription: factcheck.shortDescription,
    extendedDescription: factcheck.extendedDescription,
    photos: (photos.selected || []).map((p: any) => ({
      file: p.file,
      url: p.url,
      artist: p.artist,
      license: p.license,
      sourcePage: p.sourcePage ?? null,
    })),
    tags: tags.tags,
    minVisitTime: tags.minVisitTime,
    season: tags.season,
    religions: tags.religions ?? [],
    removeKidsFriendly: !!tags.removeKidsFriendly,
    collections: collections.suggestions,
    flags: validate.flags,
    problems: validate.problems,
    words: validate.words,
    verifyReason: verify.reason ?? null,
    pointCheck: verify.pointCheck ?? null,
    valueReason: value.reason,
    factcheckVerdict: factcheck.verdict,
    editorNotes: factcheck.editorNotes ?? '',
    territory: territory.territory,
    zone: territory.zone,
    closure: d.closure ?? null,
    website: d.website ?? null,
    googleMapsLink: googleMapsLinkOf({ ...d, id }),
    translations: translate?.languages ?? null,
    translateProblems: translate?.problems ?? [],
    sources: d.sources.map((s: any) => ({ source: s.source, url: s.url })),
  };
}

export const MODERATION_PAGE_MAX = 100;

/**
 * Страница мест с данным статусом, по порядку id. after — id последнего места прошлой страницы.
 * nextCursor равен null, если дальше мест нет.
 */
export async function getModerationCandidates(status: ModerationStatus, limit: number, after?: string) {
  const base = db.collection(COLLECTION).where('status', '==', status);
  let page = base.orderBy(FieldPath.documentId()).limit(limit + 1);
  if (after) page = page.startAfter(after);
  const [snapshot, count] = await Promise.all([page.get(), base.count().get()]);
  const docs = snapshot.docs.slice(0, limit);
  return {
    data: docs.map((doc) => toModerationCard(doc.id, doc.data())),
    total: count.data().count,
    nextCursor: snapshot.docs.length > limit ? docs[docs.length - 1].id : null,
  };
}

/** Меняет статус кандидата. false, если текущий статус не позволяет такой переход. */
export async function moveCandidate(id: string, to: string) {
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!MODERATION_MOVES[to].includes(snap.data()?.status)) return false;
  // Предусловие: запись не пройдёт, если документ изменился после чтения
  await ref.update({ status: to, updatedAt: new Date().toISOString() }, { lastUpdateTime: snap.updateTime });
  return true;
}

/** Ошибка публикации, которую стоит показать админу: нет перевода, статус уже другой и т. п. */
export class PublishError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
  }
}

// Адрес страницы места строится из EN-названия, как toSlug в DiscoverIsraelNext/utils/slug.ts
const toSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Ссылка на место в Google Maps. Поиск по названию (Maps URLs API): если Google узнаёт место, открывается его страница,
 * иначе список результатов. Лучше всего узнаётся название из источника на иврите (Tiuli пишет и город: «חוף סירונית טבריה»).
 * У точек OSM без своего имени название придумал писатель («Grill area near…»), такой страницы в Google нет: остаются координаты.
 * Те же правила в tools/place-pipeline/review-server.mjs.
 */
export function googleMapsLinkOf(d: FirebaseFirestore.DocumentData) {
  const [lat, lng] = d.coordinates;
  const ownName = d.name?.he?.trim() || d.name?.en?.trim();
  const name = ownName || (d.id?.startsWith?.('osm-') ? '' : d.stages?.write?.placeName?.he || d.stages?.write?.placeName?.en);
  return name
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`
    : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

const commonsPage = (file: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;

/**
 * Собирает документ места в формате коллекции places из кандидата с готовым переводом.
 * Расписания, цен и телефона пайплайн пока не собирает: они пустые, админ дополнит их на странице места.
 */
export function buildPlace(d: FirebaseFirestore.DocumentData, number: number): Omit<Place, 'id' | 'slug'> {
  const { write, factcheck, photos, tags, translate } = d.stages;
  const languages = translate?.languages ?? {};
  const missing = TRANSLATED_LOCALES.filter((l) => {
    const t = languages[l];
    return !t?.placeName?.trim() || !t?.shortDescription?.trim() || !t?.extendedDescription?.trim();
  });
  if (missing.length) throw new PublishError(`Нет перевода: ${missing.join(', ')}`);

  const text = (en: string, field: 'placeName' | 'shortDescription' | 'extendedDescription') =>
    ({ en, ...Object.fromEntries(TRANSLATED_LOCALES.map((l) => [l, languages[l][field].trim()])) }) as LocalizedText;
  const placeName = text(write.placeName.en, 'placeName');

  const placeTags: string[] = [...new Set<string>(tags.tags)].filter((t) => !(tags.removeKidsFriendly && t === 'kidsFriendly'));
  const months = SEASON_MONTHS[tags.season] ?? SEASON_MONTHS.all;
  const [lat, lng] = d.coordinates;

  return {
    number,
    placeName,
    shortDescription: text(factcheck.shortDescription, 'shortDescription'),
    extendedDescription: text(factcheck.extendedDescription, 'extendedDescription'),
    photos: (photos.selected || []).map((p: any) => ({
      photoName: placeName.en,
      photoWay: p.url,
      author: p.artist ?? null,
      license: p.license ?? null,
      sourcePage: p.sourcePage ?? (p.file ? commonsPage(p.file) : null),
    })),
    tags: placeTags,
    religions: tags.religions ?? [],
    schedule: null,
    // null, а не { adult: null }: фильтр «бесплатно» считает adult === null бесплатным входом
    ticketPrice: null,
    contact: { phone: null, website: d.website ?? null },
    region: d.region,
    coordinates: [lat, lng],
    googleMapsLink: googleMapsLinkOf(d),
    minVisitTime: tags.minVisitTime,
    favoriteMonths: Object.fromEntries(MONTHS.map((m, i) => [m, months.includes(i)])),
    ...(d.closure ? { closure: d.closure } : {}),
  };
}

/**
 * Публикует кандидата: документ в places с тем же id, место в выбранных коллекциях,
 * кандидат получает status: published. Всё одной атомарной записью, потом сброс кэшей.
 * collectionIds — коллекции, которые админ подтвердил из предложенных.
 */
export async function publishCandidate(id: string, collectionIds: string[]) {
  const ref = db.collection(COLLECTION).doc(id);
  const placeRef = db.collection('places').doc(id);
  const [snap, existing, last] = await Promise.all([
    ref.get(),
    placeRef.get(),
    db.collection('places').orderBy('number', 'desc').limit(1).get(),
  ]);
  const d = snap.data();
  if (!d) throw new PublishError('Кандидат не найден', 404);
  if (d.status !== 'translated') throw new PublishError(`Статус места уже ${d.status}`);
  if (existing.exists) throw new PublishError('Место с таким id уже есть в places');

  const suggested = new Set((d.stages.collections?.suggestions ?? []).map((s: any) => s.collectionId));
  const unknown = collectionIds.filter((c) => !suggested.has(c));
  if (unknown.length) throw new PublishError(`Эти коллекции не предлагались: ${unknown.join(', ')}`, 400);
  const collectionRefs = collectionIds.map((c) => db.collection('collections').doc(c));
  const collectionSnaps = await Promise.all(collectionRefs.map((r) => r.get()));
  const absent = collectionIds.filter((_, i) => !collectionSnaps[i].exists);
  if (absent.length) throw new PublishError(`Коллекций нет в базе: ${absent.join(', ')}`);

  const number = (last.docs[0]?.data().number ?? 0) + 1;
  const place = buildPlace(d, number);
  const slug = toSlug(place.placeName.en);
  const twin = (await getAllPlaces()).find((p) => toSlug(p.placeName?.en ?? '') === slug);
  if (twin) throw new PublishError(`Адрес /places/${slug} уже занят местом ${twin.id}: поменяйте английское название`);
  const now = new Date().toISOString();

  const batch = db.batch();
  batch.create(placeRef, place);
  collectionRefs.forEach((r) => batch.update(r, { placeIds: FieldValue.arrayUnion(id), updatedAt: now }));
  // Предусловие: если кандидат изменился после чтения, вся запись не пройдёт
  batch.update(
    ref,
    { status: 'published', publishedAt: now, publishedCollections: collectionIds, updatedAt: now },
    { lastUpdateTime: snap.updateTime },
  );
  await batch.commit();

  await Promise.all([invalidatePlacesCache(), collectionIds.length ? invalidateCollectionsCache() : null]);
  return { id, number, placeName: place.placeName, collections: collectionIds };
}
