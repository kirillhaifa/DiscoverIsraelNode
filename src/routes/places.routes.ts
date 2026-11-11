import { Router } from 'express';
import * as placesController from '../controllers/places.controller';
import { authenticate, requireAdmin } from '../middleware/authenticate';

const router = Router();

// GET /api/places — места: фильтры, view=card, lang, page/limit (см. контроллер)
router.get('/', placesController.getAll);

// GET /api/places/slugs — id и slug всех мест (до /:id, иначе 'slugs' примется за id)
router.get('/slugs', placesController.getSlugs);

// GET /api/places/map-points — лёгкие точки для карты (id, координаты, теги, размер); те же фильтры, что у списка
router.get('/map-points', placesController.getMapPoints);

// GET /api/places/by-slug/:slug — одно место по slug
router.get('/by-slug/:slug', placesController.getBySlug);

// DELETE /api/places/cache — инвалидация кэша (только admin)
router.delete('/cache', authenticate, requireAdmin, placesController.invalidateCache);

// GET /api/places/:id — одно место по ID (?view=card&lang=xx — карточка из кэша)
router.get('/:id', placesController.getById);

// POST /api/places — создать место (только admin)
router.post('/', authenticate, requireAdmin, placesController.createPlace);

// PATCH /api/places/:id — обновить поля места (только admin)
router.patch('/:id', authenticate, requireAdmin, placesController.updatePlace);

// DELETE /api/places/:id — удалить место (только admin)
router.delete('/:id', authenticate, requireAdmin, placesController.deletePlace);

export default router;
