import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { getAllPlaces } from './places.service';
import { Place } from '../types';

const USERS_COLLECTION = 'Users';

export async function addToWishlist(uid: string, placeId: string): Promise<void> {
  await db.collection(USERS_COLLECTION).doc(uid).update({
    wishlist: admin.firestore.FieldValue.arrayUnion(placeId),
  });
}

export async function removeFromWishlist(uid: string, placeId: string): Promise<void> {
  await db.collection(USERS_COLLECTION).doc(uid).update({
    wishlist: admin.firestore.FieldValue.arrayRemove(placeId),
  });
}

export async function isInWishlist(uid: string, placeId: string): Promise<boolean> {
  const userDoc = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!userDoc.exists) return false;
  const wishlist: string[] = userDoc.data()!.wishlist ?? [];
  return wishlist.includes(placeId);
}

/**
 * Получить полные данные мест из вишлиста.
 * Берёт места из Redis-кэша — без дополнительных чтений Firestore.
 */
export async function getWishlistPlaces(uid: string): Promise<Place[]> {
  const userDoc = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!userDoc.exists) return [];

  const wishlist: string[] = userDoc.data()!.wishlist ?? [];
  if (wishlist.length === 0) return [];

  const allPlaces = await getAllPlaces();
  return allPlaces.filter((p) => wishlist.includes(p.id));
}
