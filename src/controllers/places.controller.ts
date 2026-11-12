import { Request, Response, NextFunction } from 'express';
import * as placesService from '../services/places.service';
import { isInternalRequest } from '../middleware/trusted';
import { LOCALES, Locale, Place, PlacesFilter, PlaceView } from '../types';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
/** Сколько мест можно взять по ids без пагинации (профиль, планировщик, коллекции) */
const MAX_IDS = 200;

const list = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.split(',').map(x => x.trim()).filter(Boolean) : undefined;

/** view и lang из query: 400 на неизвестное значение, чтобы опечатка не отдала молча всё */
function parseShape(query: Request['query']): { view: PlaceView; lang?: Locale } | string {
  const view = (query.view as string | undefined) ?? 'full';
  if (view !== 'full' && view !== 'card') return `view must be full or card`;
  const lang = query.lang as string | undefined;
  if (lang !== undefined && !LOCALES.includes(lang as Locale)) return `lang must be one of ${LOCALES.join(', ')}`;
  return { view, lang: lang as Locale | undefined };
}

/**
 * Фильтры из query — общие для списка (GET /api/places) и карты (GET /api/places/map-points).
 * region, tags (+ tagsMatch=all|any), religions, free, minRating, maxVisitTime, ids, excludeIds, search,
 * near=lat,lng + radiusKm. Строка — текст ошибки для 400.
 */
function parseFilters(query: Request['query']): PlacesFilter | string {
  const { region, tags, tagsMatch, religions, free, minRating, maxVisitTime, ids, excludeIds, search, near, radiusKm } = query;

  if (tagsMatch !== undefined && tagsMatch !== 'all' && tagsMatch !== 'any') return 'tagsMatch must be all or any';

  let nearFilter: PlacesFilter['near'];
  if (near !== undefined || radiusKm !== undefined) {
    const [lat, lng] = String(near ?? '').split(',').map(Number);
    const radius = Number(radiusKm);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius) || radius <= 0) {
      return 'near must be lat,lng and radiusKm a positive number';
    }
    nearFilter = { lat, lng, radiusKm: radius };
  }

  return {
    region: region as string | undefined,
    tags: list(tags),
    tagsMatch: tagsMatch as PlacesFilter['tagsMatch'],
    religions: list(religions) as PlacesFilter['religions'],
    free: free === 'true' ? true : undefined,
    minRating: minRating ? Number(minRating) : undefined,
    maxVisitTime: maxVisitTime ? Number(maxVisitTime) : undefined,
    ids: list(ids),
    excludeIds: list(excludeIds),
    search: search as string | undefined,
    near: nearFilter,
  };
}

/**
 * GET /api/places
 * Фильтры — см. parseFilters.
 * view=card — без extendedDescription; lang=xx — тексты только на xx и en.
 * sort=rating|popular — лучшие по оценке (только оценённые) или с наибольшим числом оценок.
 * page/limit — пагинация (limit по умолчанию 20, максимум 100).
 * Без page/limit: с ids (до 200) — все эти места; иначе весь список, но только админу и доверенному серверу
 * (x-internal-key), остальным 400 — полный список весит мегабайты.
 */
export async function getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = req.query;

    const shape = parseShape(req.query);
    if (typeof shape === 'string') {
      res.status(400).json({ error: shape });
      return;
    }
    const filters = parseFilters(req.query);
    if (typeof filters === 'string') {
      res.status(400).json({ error: filters });
      return;
    }

    const { sort } = req.query;
    if (sort !== undefined && sort !== 'rating' && sort !== 'popular') {
      res.status(400).json({ error: 'sort must be rating or popular' });
      return;
    }
    if (filters.ids && filters.ids.length > MAX_IDS) {
      res.status(400).json({ error: `ids: at most ${MAX_IDS}` });
      return;
    }

    let places = await placesService.getPlaces(filters);
    if (sort) places = placesService.sortPlaces(places, sort);
    const shapeAll = (items: Place[]) => items.map(p => placesService.shapePlace(p, shape.view, shape.lang));

    if (page === undefined && limit === undefined) {
      if (!filters.ids && req.user?.role !== 'admin' && !isInternalRequest(req)) {
        res.status(400).json({ error: `page/limit required (limit up to ${MAX_LIMIT}) or ids` });
        return;
      }
      res.json({ data: shapeAll(places), count: places.length });
      return;
    }

    const pageNum = Number(page ?? 1);
    const limitNum = Number(limit ?? DEFAULT_LIMIT);
    if (!Number.isInteger(pageNum) || pageNum < 1 || !Number.isInteger(limitNum) || limitNum < 1 || limitNum > MAX_LIMIT) {
      res.status(400).json({ error: `page must be >= 1, limit must be 1..${MAX_LIMIT}` });
      return;
    }

    const start = (pageNum - 1) * limitNum;
    const data = shapeAll(places.slice(start, start + limitNum));
    res.json({
      data,
      count: data.length,
      total: places.length,
      page: pageNum,
      limit: limitNum,
      hasMore: start + limitNum < places.length,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/places/map-points — точки для карты: { id, lngLat, tags } без текстов и фото.
 * Те же фильтры, что у GET /api/places. Карточку места карта грузит при наведении: GET /api/places/:id?view=card&lang=xx
 */
export async function getMapPoints(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = parseFilters(req.query);
    if (typeof filters === 'string') {
      res.status(400).json({ error: filters });
      return;
    }
    const data = placesService.toMapPoints(await placesService.getPlaces(filters));
    res.json({ data, count: data.length });
  } catch (err) {
    next(err);
  }
}

/** GET /api/places/tags — все теги, которые есть у мест (подсказки в редакторе тегов) */
export async function getTags(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: await placesService.getAllTags() });
  } catch (err) {
    next(err);
  }
}

/** GET /api/places/slugs — id, slug и updatedAt всех мест */
export async function getSlugs(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await placesService.getPlaceSlugs();
    res.json({ data, count: data.length });
  } catch (err) {
    next(err);
  }
}

/** GET /api/places/by-slug/:slug — одно место; принимает и старый формат slug, ответ содержит канонический place.slug */
export async function getBySlug(req: Request<{ slug: string }>, res: Response, next: NextFunction) {
  try {
    const shape = parseShape(req.query);
    if (typeof shape === 'string') {
      res.status(400).json({ error: shape });
      return;
    }
    const place = await placesService.getPlaceBySlug(req.params.slug);
    if (!place) {
      res.status(404).json({ error: 'Place not found' });
      return;
    }
    res.json({ data: placesService.shapePlace(place, shape.view, shape.lang) });
  } catch (err) {
    next(err);
  }
}

export async function invalidateCache(_req: Request, res: Response, next: NextFunction) {
  try {
    await placesService.invalidatePlacesCache();
    res.json({ message: 'Cache invalidated' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/places/:id — место из Firestore целиком.
 * С view или lang — из кэша и в этой форме (карточка при наведении на точку карты: view=card&lang=xx).
 */
export async function getById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    if (req.query.view !== undefined || req.query.lang !== undefined) {
      const shape = parseShape(req.query);
      if (typeof shape === 'string') {
        res.status(400).json({ error: shape });
        return;
      }
      const cached = await placesService.getCachedPlaceById(id);
      if (!cached) {
        res.status(404).json({ error: 'Place not found' });
        return;
      }
      res.json({ data: placesService.shapePlace(cached, shape.view, shape.lang) });
      return;
    }
    const place = await placesService.getPlaceById(id);
    if (!place) {
      res.status(404).json({ error: 'Place not found' });
      return;
    }
    res.json({ data: place });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/places — создать место (admin only)
 */
export async function createPlace(req: Request, res: Response, next: NextFunction) {
  try {
    const place = await placesService.createPlace(req.body as Omit<Place, 'id'>);
    res.status(201).json({ data: place });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/places/:id — обновить поля места (admin only)
 */
export async function updatePlace(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const place = await placesService.updatePlace(id, req.body);
    res.json({ data: place });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/places/:id — удалить место (admin only)
 */
export async function deletePlace(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const deleted = await placesService.deletePlace(req.params.id);

    if (!deleted) {
      res.status(404).json({ error: 'Place not found' });
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
