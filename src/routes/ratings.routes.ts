import { Router } from 'express';
import * as ratingsController from '../controllers/ratings.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// GET /api/ratings/my — оценки текущего пользователя (приватно)
router.get('/my', authenticate, ratingsController.getMyRatings);

// GET /api/ratings/:placeId — средний рейтинг места (публично)
router.get('/:placeId', ratingsController.getByPlace);

// POST /api/ratings — поставить или обновить оценку
router.post('/', authenticate, ratingsController.submit);

// DELETE /api/ratings/:placeId — удалить свою оценку
router.delete('/:placeId', authenticate, ratingsController.remove);

export default router;
