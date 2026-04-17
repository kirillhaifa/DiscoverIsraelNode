import { db } from '../config/firebase';
import { Collection, CreateCollectionData } from '../types';
import { redisClient } from '../config/redis';

const COLLECTIONS_COLLECTION = 'collections';
const CACHE_KEY = 'collections:public';
const CACHE_TTL = 60 * 60 * 24; // 24 часа

/**
 * Получить все коллекции (публичные + приватные — только для admin).
 */
export async function getAllCollections(): Promise<Collection[]> {
  const snapshot = await db.collection(COLLECTIONS_COLLECTION).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Collection));
}

/**
 * Получить только публичные коллекции (с кэшем).
 */
export async function getPublicCollections(): Promise<Collection[]> {
  const cached = await redisClient.get(CACHE_KEY);
  if (cached) {
    return JSON.parse(cached) as Collection[];
  }

  const snapshot = await db
    .collection(COLLECTIONS_COLLECTION)
    .where('isPublic', '==', true)
    .get();
  const collections = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Collection));

  await redisClient.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify(collections));
  return collections;
}

/**
 * Получить коллекции конкретного пользователя (id из ошибки).
 */
export async function getUserCollections(userId: string): Promise<Collection[]> {
  const snapshot = await db
    .collection(COLLECTIONS_COLLECTION)
    .where('createdBy', '==', userId)
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Collection));
}

/**
 * Получить одну коллекцию по id.
 */
export async function getCollectionById(id: string): Promise<Collection | null> {
  const doc = await db.collection(COLLECTIONS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Collection;
}

/**
 * Создать коллекцию + инвалидировать публичный кэш если коллекция публичная.
 */
export async function createCollection(
  data: CreateCollectionData,
  userId: string
): Promise<Collection> {
  const now = new Date().toISOString();
  const payload: Omit<Collection, 'id'> = {
    ...data,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  };
  const docRef = await db.collection(COLLECTIONS_COLLECTION).add(payload);

  if (data.isPublic) {
    await redisClient.del(CACHE_KEY);
  }

  return { id: docRef.id, ...payload };
}
