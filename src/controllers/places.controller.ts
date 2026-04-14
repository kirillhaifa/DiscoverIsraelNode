import { Request, Response, NextFunction } from 'express';
import * as placesService from '../services/places.service';
import { PlacesFilter } from '../types';

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
