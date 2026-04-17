import { Request, Response, NextFunction } from 'express';
import * as ratingsService from '../services/ratings.service';

/**
 * POST /api/ratings
 * Body: { placeId: string, rating: number (1-10) }
 * Добавляет или обновляет оценку текущего пользователя.
 */
export async function submit(req: Request, res: Response, next: NextFunction) {
  try {
    const uid = req.user!.uid;
    const { placeId, rating } = req.body;

    if (!placeId || typeof rating !== 'number' || rating < 1 || rating > 10) {
      res.status(400).json({ error: 'placeId and rating (1-10) are required' });
      return;
    }

    await ratingsService.submitRating(uid, placeId, rating);
    res.json({ message: 'Rating saved' });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/ratings/:placeId
 * Удаляет оценку текущего пользователя для данного места.
 */
export async function remove(req: Request<{ placeId: string }>, res: Response, next: NextFunction) {
  try {
    const uid = req.user!.uid;
    const { placeId } = req.params;

    await ratingsService.deleteRating(uid, placeId);
    res.json({ message: 'Rating deleted' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/ratings/:placeId
 * Возвращает средний рейтинг и количество оценок для места.
 */
export async function getByPlace(
  req: Request<{ placeId: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const { placeId } = req.params;
    const summary = await ratingsService.getRatingsByPlace(placeId);
    res.json({ data: summary });
  } catch (err) {
    next(err);
  }
}
