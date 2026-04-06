import { db } from '../config/firebase';
import { Place } from '../types';

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
  const snapshot = await db.collection('places').get();
  return snapshot.docs.map((doc) => normalizePlace(doc.id, doc.data()));
}

export async function getPlaceById(id: string): Promise<Place | null> {
  const docRef = await db.collection('places').doc(id).get();
  if (!docRef.exists) return null;
  return normalizePlace(docRef.id, docRef.data()!);
}
