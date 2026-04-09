import { Router } from 'express';
import * as placesController from '../controllers/places.controller';
import { cache } from '../middleware/cache';

const router = Router();

// GET /api/places — все места
router.get('/', cache('places', 600), placesController.getAll);

// GET /api/places/:id — одно место по ID
router.get('/:id', cache('place', 600), placesController.getById);

export default router;
