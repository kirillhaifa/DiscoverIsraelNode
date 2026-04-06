import { Request, Response, NextFunction } from 'express';
import * as placesService from '../services/places.service';

export async function getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const places = await placesService.getAllPlaces();
    res.json({ data: places, count: places.length });
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
