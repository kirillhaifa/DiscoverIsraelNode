import { db } from '../config/firebase';
import { updatePlaceInCache } from './places.service';

const USERS_COLLECTION = 'Users';
const PLACES_COLLECTION = 'places';

export interface RatingEntry {
  placeId: string;
  rating: number;
}

export interface PlaceRatingSummary {
  averageRating: number | null;
  count: number;
}

/**
 * Добавить или обновить оценку — атомарная транзакция.
 * Итого: 2 чтения + 2 записи, race condition невозможен.
 */
export async function submitRating(
  uid: string,
  placeId: string,
  newRating: number,
): Promise<void> {
  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const placeRef = db.collection(PLACES_COLLECTION).doc(placeId);

  // Результаты транзакции нужны снаружи для обновления Redis-кэша
  let newRatingsSum = 0;
  let newRatingsCount = 0;
  let newAverageRating: number | null = null;

  await db.runTransaction(async (tx) => {
    const [userDoc, placeDoc] = await Promise.all([tx.get(userRef), tx.get(placeRef)]);

    if (!userDoc.exists) throw new Error('User does not exist.');
    if (!placeDoc.exists) throw new Error('Place does not exist.');

    const userData = userDoc.data()!;
    const ratings: RatingEntry[] = userData.ratings ?? [];
    const idx = ratings.findIndex((r) => r.placeId === placeId);
    const oldRating: number | null = idx >= 0 ? ratings[idx].rating : null;

    if (idx >= 0) {
      ratings[idx].rating = newRating;
    } else {
      ratings.push({ placeId, rating: newRating });
    }

    const placeData = placeDoc.data()!;
    let ratingsSum: number = placeData.ratingsSum ?? 0;
    let ratingsCount: number = placeData.ratingsCount ?? 0;

    if (oldRating !== null) {
      ratingsSum = ratingsSum - oldRating + newRating; // замена — счётчик не меняем
    } else {
      ratingsSum += newRating;
      ratingsCount += 1;
    }

    const averageRating = ratingsCount > 0
      ? Math.round((ratingsSum / ratingsCount) * 10) / 10
      : null;

    // Передаём результат наружу из колбэка транзакции
    newRatingsSum = ratingsSum;
    newRatingsCount = ratingsCount;
    newAverageRating = averageRating;

    tx.update(userRef, { ratings });
    tx.update(placeRef, { ratingsSum, ratingsCount, averageRating });
  });

  // Точечно обновляем Redis — не сбрасываем весь список мест
  await updatePlaceInCache(placeId, {
    averageRating: newAverageRating ?? undefined,
    ratingsCount: newRatingsCount,
    ratingsSum: newRatingsSum,
  });
}

/**
 * Удалить оценку пользователя — атомарная транзакция.
 */
export async function deleteRating(uid: string, placeId: string): Promise<void> {
  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const placeRef = db.collection(PLACES_COLLECTION).doc(placeId);

  let newRatingsSum = 0;
  let newRatingsCount = 0;
  let newAverageRating: number | null = null;
  let hadRating = false;

  await db.runTransaction(async (tx) => {
    const [userDoc, placeDoc] = await Promise.all([tx.get(userRef), tx.get(placeRef)]);

    if (!userDoc.exists) throw new Error('User does not exist.');
    if (!placeDoc.exists) throw new Error('Place does not exist.');

    const userData = userDoc.data()!;
    const ratings: RatingEntry[] = userData.ratings ?? [];
    const existing = ratings.find((r) => r.placeId === placeId);

    if (!existing) return; // оценки не было — выходим без изменений

    hadRating = true;
    const updatedRatings = ratings.filter((r) => r.placeId !== placeId);

    const placeData = placeDoc.data()!;
    let ratingsSum: number = (placeData.ratingsSum ?? 0) - existing.rating;
    let ratingsCount: number = Math.max(0, (placeData.ratingsCount ?? 1) - 1);

    const averageRating = ratingsCount > 0
      ? Math.round((ratingsSum / ratingsCount) * 10) / 10
      : null;

    newRatingsSum = ratingsSum;
    newRatingsCount = ratingsCount;
    newAverageRating = averageRating;

    tx.update(userRef, { ratings: updatedRatings });
    tx.update(placeRef, { ratingsSum, ratingsCount, averageRating });
  });

  // Обновляем кэш только если оценка реально была удалена
  if (hadRating) {
    await updatePlaceInCache(placeId, {
      averageRating: newAverageRating ?? undefined,
      ratingsCount: newRatingsCount,
      ratingsSum: newRatingsSum,
    });
  }
}

/**
 * Получить все оценки текущего пользователя.
 */
export async function getMyRatings(uid: string): Promise<RatingEntry[]> {
  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) throw new Error('User does not exist.');

  return (userDoc.data()!.ratings ?? []) as RatingEntry[];
}

/**
 * Получить средний рейтинг места — читает одно поле одного документа.
 */
export async function getRatingsByPlace(placeId: string): Promise<PlaceRatingSummary> {
  const placeDoc = await db.collection(PLACES_COLLECTION).doc(placeId).get();

  if (!placeDoc.exists) {
    return { averageRating: null, count: 0 };
  }

  const data = placeDoc.data()!;
  return {
    averageRating: data.averageRating ?? null,
    count: data.ratingsCount ?? 0,
  };
}
