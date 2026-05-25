import { Router } from 'express';
import * as collectionsController from '../controllers/collections.controller';
import { authenticate, requireAdmin } from '../middleware/authenticate';

const router = Router();

// GET /api/collections          — публичные коллекции (без авторизации)
router.get('/', collectionsController.listPublicCollections);

// GET /api/collections/all      — все коллекции (только admin)
router.get('/all', authenticate, requireAdmin, collectionsController.listAllCollections);

// GET /api/collections/my       — коллекции текущего пользователя
router.get('/my', authenticate, collectionsController.listMyCollections);

// GET /api/collections/:id      — одна коллекция по id (без авторизации)
router.get('/:id', collectionsController.getCollection);

// POST /api/collections         — создать коллекцию
router.post('/', authenticate, collectionsController.createCollectionHandler);

// PATCH /api/collections/:id     — обновить коллекцию (только admin)
router.patch('/:id', authenticate, requireAdmin, collectionsController.updateCollectionHandler);

// DELETE /api/collections/:id    — удалить коллекцию (только admin)
router.delete('/:id', authenticate, requireAdmin, collectionsController.deleteCollectionHandler);

export default router;
