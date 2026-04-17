import { Router } from 'express';
import * as wishlistController from '../controllers/wishlist.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// GET  /api/users/me/wishlist          — получить места из вишлиста
router.get('/', authenticate, wishlistController.getWishlist);

// POST /api/users/me/wishlist/:placeId — добавить
router.post('/:placeId', authenticate, wishlistController.add);

// DELETE /api/users/me/wishlist/:placeId — удалить
router.delete('/:placeId', authenticate, wishlistController.remove);

export default router;
