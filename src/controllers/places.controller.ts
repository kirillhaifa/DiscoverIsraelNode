import { Request, Response, NextFunction } from 'express';
import * as placesService from '../services/places.service';
import { LOCALES, Locale, Place, PlacesFilter, PlaceView } from '../types';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

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
 * GET /api/places
 * Фильтры: region, tags, religions, free, minRating, maxVisitTime, ids, search.
 * view=card — без extendedDescription; lang=xx — тексты только на xx и en.
 * page/limit — пагинация (limit по умолчанию 20, максимум 100). Без них — весь список, как раньше.
 */
export async function getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const { region, tags, religions, free, minRating, maxVisitTime, ids, search, page, limit } = req.query;

    const shape = parseShape(req.query);
    if (typeof shape === 'string') {
      res.status(400).json({ error: shape });
      return;
    }

    const filters: PlacesFilter = {
      region: region as string | undefined,
      tags: list(tags),
      religions: list(religions) as PlacesFilter['religions'],
      free: free === 'true' ? true : undefined,
      minRating: minRating ? Number(minRating) : undefined,
      maxVisitTime: maxVisitTime ? Number(maxVisitTime) : undefined,
      ids: list(ids),
      search: search as string | undefined,
    };

    const places = await placesService.getPlaces(filters);
    const shapeAll = (items: Place[]) => items.map(p => placesService.shapePlace(p, shape.view, shape.lang));

    if (page === undefined && limit === undefined) {
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

export async function getById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
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
