import { Request, Response, NextFunction } from 'express';
import * as wishlistService from '../services/wishlist.service';

/**
 * POST /api/users/me/wishlist/:placeId
 * Добавить место в вишлист.
 */
export async function add(req: Request<{ placeId: string }>, res: Response, next: NextFunction) {
  try {
    const uid = req.user!.uid;
    const { placeId } = req.params;
    await wishlistService.addToWishlist(uid, placeId);
    res.status(200).json({ message: 'Added to wishlist' });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/users/me/wishlist/:placeId
 * Удалить место из вишлиста.
 */
export async function remove(req: Request<{ placeId: string }>, res: Response, next: NextFunction) {
  try {
    const uid = req.user!.uid;
    const { placeId } = req.params;
    await wishlistService.removeFromWishlist(uid, placeId);
    res.status(200).json({ message: 'Removed from wishlist' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/me/wishlist
 * Получить места из вишлиста (полные объекты).
 */
export async function getWishlist(req: Request, res: Response, next: NextFunction) {
  try {
    const uid = req.user!.uid;
    const places = await wishlistService.getWishlistPlaces(uid);
    res.json({ data: places, count: places.length });
  } catch (err) {
    next(err);
  }
}
