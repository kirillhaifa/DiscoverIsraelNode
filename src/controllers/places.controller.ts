import { Request, Response, NextFunction } from 'express';
import * as placesService from '../services/places.service';
import { Place, PlacesFilter } from '../types';

export async function getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const { region, tags, religions, free, minRating, maxVisitTime } = req.query;

    const filters: PlacesFilter = {
      region: region as string | undefined,
      tags: tags ? (tags as string).split(',').map(t => t.trim()) : undefined,
      religions: religions ? (religions as string).split(',').map(r => r.trim()) as any : undefined,
      free: free === 'true' ? true : undefined,
      minRating: minRating ? Number(minRating) : undefined,
      maxVisitTime: maxVisitTime ? Number(maxVisitTime) : undefined,
    };

    const places = await placesService.getPlaces(filters);
    res.json({ data: places, count: places.length });
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
