// routes/collectionGroups.routes.ts
import { Router } from 'express';
import * as ctrl from '../controllers/collectionGroups.controller';
import { authenticate, requireAdmin } from '../middleware/authenticate';

const router = Router();

// GET /api/collection-groups          — публичные группы (без авторизации)
router.get('/', ctrl.listPublicGroups);

// GET /api/collection-groups/all      — все (только admin)
router.get('/all', authenticate, requireAdmin, ctrl.listAllGroups);

// GET /api/collection-groups/:id
router.get('/:id', ctrl.getGroup);

// POST /api/collection-groups         — создать (только admin)
router.post('/', authenticate, requireAdmin, ctrl.createGroup);

// PATCH /api/collection-groups/:id    — обновить (только admin)
router.patch('/:id', authenticate, requireAdmin, ctrl.updateGroup);

// DELETE /api/collection-groups/:id   — удалить (только admin)
router.delete('/:id', authenticate, requireAdmin, ctrl.deleteGroup);

export default router;
