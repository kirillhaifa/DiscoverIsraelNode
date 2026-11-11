// Общие типы — синхронизированы с фронтендом (src/types.ts)

export type Religion =
  | 'jewish'
  | 'christian'
  | 'muslim'
  | 'druze'
  | 'bahai'
  | 'samaritan'
  | 'circassian'
  | 'armenian'
  | 'bedouin'
  | 'secular';

export type PlaceTag = string; // 'hiking' | 'beach' | 'free' | 'bombShelter' | ...

// Языки сайта — синхронно с DiscoverIsraelNext/i18n.config.ts
export const LOCALES = ['ru', 'en', 'he', 'ar', 'es', 'pt', 'fr', 'de', 'it', 'am'] as const;
export type Locale = (typeof LOCALES)[number];

/** ru/en/he заполнены всегда, остальные языки — по мере перевода (фронт показывает en, если перевода нет). */
export type LocalizedText = { ru: string; en: string; he: string } & Partial<Record<Locale, string>>;

export interface Place {
  id: string;
  slug: string;             // из placeName.en (utils/slug.ts), считается при чтении, в Firestore не хранится
  number: number;
  placeName: LocalizedText;
  shortDescription: LocalizedText;
  extendedDescription: LocalizedText;
  // author, license и sourcePage есть у фото из пайплайна: Commons и israel-in-photos требуют подпись
  photos: { photoName: string; photoWay: string; author?: string | null; license?: string | null; sourcePage?: string | null }[];
  tags: PlaceTag[];
  religions: Religion[];
  schedule: unknown;
  ticketPrice: { adult: string | null; child: string | null } | null; // null — цена неизвестна
  contact: { phone: string | null; website: string | null } | null;
  region: string;
  coordinates: [number, number];
  googleMapsLink: string;
  minVisitTime: number;
  favoriteMonths: Record<string, boolean>;
  averageRating?: number;   // ratingsSum / ratingsCount, обновляется атомарно
  ratingsCount?: number;    // кол-во оценок
  ratingsSum?: number;      // сумма всех оценок — нужна для пересчёта без скана Users
  closure?: PlaceClosure | null; // есть объект — на странице плашка «закрыто на неопределённый срок»
}

export interface PlaceClosure {
  source: string;     // ссылка на официальное сообщение
  checkedAt: string;  // дата проверки, YYYY-MM-DD
}

export interface PlacesFilter {
  region?: string;
  tags?: PlaceTag[];       // ANY совпадение
  religions?: Religion[];  // ANY совпадение
  free?: boolean;          // tags.includes('free') || ticketPrice.adult === null
  minRating?: number;
  maxVisitTime?: number;   // minVisitTime <= maxVisitTime
  ids?: string[];          // только эти места, в порядке ids
  search?: string;         // подстрока в названии, коротком тексте или регионе на любом языке
  tagsMatch?: 'any' | 'all'; // как совпадают tags: any (по умолчанию) или все сразу
  excludeIds?: string[];   // убрать эти места (фильтр «непосещённые»: id мест, оценённых пользователем)
  near?: { lat: number; lng: number; radiusKm: number }; // не дальше radiusKm от точки
}

/** Лёгкая точка для карты: без текстов и фото, карточка грузится отдельно при наведении */
export interface MapPoint {
  id: string;
  lngLat: [number, number]; // уже в порядке [lng, lat], в базе встречаются оба порядка
  tags: PlaceTag[]; // по ним фронт выбирает цвет и размер точки
}

/** card — без extendedDescription (90% веса), для списков и карточек */
export type PlaceView = 'full' | 'card';
export type PlaceCard = Omit<Place, 'extendedDescription'>;

export interface Rating {
  placeId: string;
  rating: number;
}

export interface Collection {
  id: string;
  title: LocalizedText;
  shortDescription: LocalizedText;
  longDescription: LocalizedText;
  coverPhoto: string;
  collectionPhotos?: string[];
  placeIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  isPublic: boolean;
}

export interface CreateCollectionData {
  title: LocalizedText;
  shortDescription: LocalizedText;
  longDescription: LocalizedText;
  coverPhoto: string;
  collectionPhotos?: string[];
  placeIds: string[];
  isPublic: boolean;
}

/**
 * Группа коллекций — виджет на лендинге.
 * Содержит список id коллекций которые показываются вместе под одним заголовком.
 */
export interface CollectionGroup {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  collectionIds: string[];  // id из коллекции `collections`
  coverPhoto: string;
  order: number;            // порядок отображения на лендинге
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCollectionGroupData {
  title: LocalizedText;
  description: LocalizedText;
  collectionIds: string[];
  coverPhoto: string;
  order: number;
  isPublic: boolean;
}

export interface User {
  userID: string;
  name: string | null;
  surname: string | null;
  email: string;
  premiumStatus: boolean;
  profilePicture: string | null;
  joinDate: unknown;
  plans: string[];       // legacy
  wishlist: string[];    // wishlist (сердечко)
  role: 'user' | 'admin';
  language: Locale;
  colorTheme: 'light' | 'dark';
}
