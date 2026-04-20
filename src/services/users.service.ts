import { db } from '../config/firebase';
import { User } from '../types';

const USERS_COLLECTION = 'Users';

export interface CreateUserData {
  userID: string;
  name: string | null;
  surname: string | null;
  email: string;
  profilePicture: string | null;
  language?: 'en' | 'he' | 'ru';
  colorTheme?: 'light' | 'dark';
}

export interface UpdateUserData {
  name?: string | null;
  surname?: string | null;
  profilePicture?: string | null;
  language?: 'en' | 'he' | 'ru';
  colorTheme?: 'light' | 'dark';
}

/**
 * Upsert пользователя — создаёт профиль если не существует, не перезаписывает если уже есть.
 */
export async function createUserIfNotExists(data: CreateUserData): Promise<User> {
  const userRef = db.collection(USERS_COLLECTION).doc(data.userID);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    const newUser = {
      userID: data.userID,
      name: data.name,
      surname: data.surname,
      email: data.email,
      premiumStatus: false,
      profilePicture: data.profilePicture,
      joinDate: new Date(),
      ratings: [],  // храним в Firestore для транзакций
      plans: [],    // legacy — оставляем пустым для совместимости
      wishlist: [], // ← вишлист (сердечко)
      role: 'user',
      language: data.language ?? 'en',
      colorTheme: data.colorTheme ?? 'light',
    };
    await userRef.set(newUser);
    // Возвращаем только поля профиля (без ratings — они в Firestore для транзакций)
    const { ratings: _r, ...profile } = newUser;
    return profile as unknown as User;
  }

  const d = userDoc.data()!;
  return {
    userID: data.userID,
    name: d.name ?? null,
    surname: d.surname ?? null,
    email: d.email ?? '',
    premiumStatus: d.premiumStatus ?? false,
    profilePicture: d.profilePicture ?? null,
    joinDate: d.joinDate,
    plans: d.plans ?? [],
    wishlist: d.wishlist ?? [],
    role: d.role ?? 'user',
    language: d.language ?? 'en',
    colorTheme: d.colorTheme ?? 'light',
  } as User;
}

/**
 * Получить профиль пользователя по uid.
 */
export async function getUserById(uid: string): Promise<User | null> {
  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    return null;
  }

  const d = userDoc.data()!;
  return {
    userID: uid,
    name: d.name ?? null,
    surname: d.surname ?? null,
    email: d.email ?? '',
    premiumStatus: d.premiumStatus ?? false,
    profilePicture: d.profilePicture ?? null,
    joinDate: d.joinDate,
    plans: d.plans ?? [],
    wishlist: d.wishlist ?? [],
    role: d.role ?? 'user',
    language: d.language ?? 'en',
    colorTheme: d.colorTheme ?? 'light',
  } as User;
}

/**
 * Обновить разрешённые поля профиля.
 */
export async function updateUser(uid: string, data: UpdateUserData): Promise<User> {
  const userRef = db.collection(USERS_COLLECTION).doc(uid);

  // Разрешаем обновлять только безопасные поля
  const allowed: (keyof UpdateUserData)[] = [
    'name',
    'surname',
    'profilePicture',
    'language',
    'colorTheme',
  ];

  const safeData: Partial<UpdateUserData> = {};
  for (const key of allowed) {
    if (key in data) {
      (safeData as any)[key] = data[key];
    }
  }

  await userRef.update(safeData);

  const updated = await userRef.get();
  const d = updated.data()!;
  return {
    userID: uid,
    name: d.name ?? null,
    surname: d.surname ?? null,
    email: d.email ?? '',
    premiumStatus: d.premiumStatus ?? false,
    profilePicture: d.profilePicture ?? null,
    joinDate: d.joinDate,
    plans: d.plans ?? [],
    wishlist: d.wishlist ?? [],
    role: d.role ?? 'user',
    language: d.language ?? 'en',
    colorTheme: d.colorTheme ?? 'light',
  } as User;
}
