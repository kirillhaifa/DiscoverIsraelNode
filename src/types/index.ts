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

export interface Place {
  id: string;
  number: number;
  placeName: { en: string; he: string; ru: string };
  shortDescription: { en: string; he: string; ru: string };
  extendedDescription: { en: string; he: string; ru: string };
  photos: { photoName: string; photoWay: string }[];
  tags: PlaceTag[];
  religions: Religion[];
  schedule: unknown;
  ticketPrice: { adult: string | null; child: string | null };
  contact: { phone: string | null; website: string | null } | null;
  region: string;
  coordinates: [number, number];
  googleMapsLink: string;
  minVisitTime: number;
  favoriteMonths: Record<string, boolean>;
  averageRating?: number;   // ratingsSum / ratingsCount, обновляется атомарно
  ratingsCount?: number;    // кол-во оценок
  ratingsSum?: number;      // сумма всех оценок — нужна для пересчёта без скана Users
}

export interface PlacesFilter {
  region?: string;
  tags?: PlaceTag[];       // ANY совпадение
  religions?: Religion[];  // ANY совпадение
  free?: boolean;          // tags.includes('free') || ticketPrice.adult === null
  minRating?: number;
  maxVisitTime?: number;   // minVisitTime <= maxVisitTime
}

export interface Rating {
  placeId: string;
  rating: number;
}

export interface User {
  userID: string;
  name: string | null;
  surname: string | null;
  email: string;
  premiumStatus: boolean;
  profilePicture: string | null;
  joinDate: unknown;
  ratings: Rating[];
  plans: string[];       // wishlist (сердечко)
  role: 'user' | 'admin';
  language: 'en' | 'he' | 'ru';
  colorTheme: 'light' | 'dark';
}
