import { Router } from 'express';
import * as placesController from '../controllers/places.controller';

const router = Router();

// GET /api/places — все места
router.get('/', placesController.getAll);

// GET /api/places/:id — одно место по ID
router.get('/:id', placesController.getById);

export default router;
