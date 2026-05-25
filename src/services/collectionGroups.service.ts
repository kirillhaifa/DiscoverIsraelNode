// services/collectionGroups.service.ts
import { db } from '../config/firebase';
import { CollectionGroup, CreateCollectionGroupData } from '../types';
import { redisClient } from '../config/redis';

const FS_COLLECTION = 'collectionGroups';
const CACHE_KEY = 'collectionGroups:public';
const CACHE_TTL = 60 * 60 * 24; // 24h

export async function getPublicCollectionGroups(): Promise<CollectionGroup[]> {
  const cached = await redisClient.get(CACHE_KEY);
  if (cached) return JSON.parse(cached) as CollectionGroup[];

  const snapshot = await db
    .collection(FS_COLLECTION)
    .where('isPublic', '==', true)
    .orderBy('order', 'asc')
    .get();

  const groups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CollectionGroup));
  await redisClient.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify(groups));
  return groups;
}

export async function getAllCollectionGroups(): Promise<CollectionGroup[]> {
  const snapshot = await db.collection(FS_COLLECTION).orderBy('order', 'asc').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CollectionGroup));
}

export async function getCollectionGroupById(id: string): Promise<CollectionGroup | null> {
  const doc = await db.collection(FS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as CollectionGroup;
}

export async function createCollectionGroup(
  data: CreateCollectionGroupData
): Promise<CollectionGroup> {
  const now = new Date().toISOString();
  const payload: Omit<CollectionGroup, 'id'> = { ...data, createdAt: now, updatedAt: now };
  const docRef = await db.collection(FS_COLLECTION).add(payload);
  if (data.isPublic) await redisClient.del(CACHE_KEY);
  return { id: docRef.id, ...payload };
}

export async function updateCollectionGroup(
  id: string,
  data: Partial<CreateCollectionGroupData>
): Promise<CollectionGroup | null> {
  const now = new Date().toISOString();
  const ref = db.collection(FS_COLLECTION).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return null;
  await ref.update({ ...data, updatedAt: now });
  await redisClient.del(CACHE_KEY);
  return { id, ...doc.data(), ...data, updatedAt: now } as CollectionGroup;
}

export async function deleteCollectionGroup(id: string): Promise<void> {
  await db.collection(FS_COLLECTION).doc(id).delete();
  await redisClient.del(CACHE_KEY);
}
