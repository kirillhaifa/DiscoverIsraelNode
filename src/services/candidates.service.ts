import { FieldPath } from 'firebase-admin/firestore';
import { db } from '../config/firebase';

const COLLECTION = 'placeCandidates';
const MODERATION_STATUSES = ['moderation', 'translated'];
// Куда можно перейти и откуда. Те же правила в tools/place-pipeline/review-server.mjs
export const MODERATION_MOVES: Record<string, string[]> = {
  ready_for_translation: ['moderation'],
  ready_to_publish: ['translated'],
  rejected_admin: ['moderation', 'translated'],
};

/** Карточка места для вкладки «На модерации». Те же поля, что отдаёт локальный review-server. */
function toModerationCard(id: string, d: FirebaseFirestore.DocumentData) {
  const { value, photos, factcheck, write, tags, collections, validate, verify, territory } = d.stages;
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
    sources: d.sources.map((s: any) => ({ source: s.source, url: s.url })),
  };
}

export const MODERATION_PAGE_MAX = 100;

/**
 * Страница мест на модерации, по порядку id. after — id последнего места прошлой страницы.
 * nextCursor равен null, если дальше мест нет.
 */
export async function getModerationCandidates(limit: number, after?: string) {
  const base = db.collection(COLLECTION).where('status', 'in', MODERATION_STATUSES);
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
