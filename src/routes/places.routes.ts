import { Router } from 'express';
import * as placesController from '../controllers/places.controller';
import { authenticate, requireAdmin } from '../middleware/authenticate';

const router = Router();

// GET /api/places — все места (с опциональными фильтрами)
router.get('/', placesController.getAll);

// DELETE /api/places/cache — инвалидация кэша (только admin)
router.delete('/cache', authenticate, requireAdmin, placesController.invalidateCache);

// GET /api/places/:id — одно место по ID
router.get('/:id', placesController.getById);

export default router;
