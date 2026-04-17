import { Router } from 'express';
import * as usersController from '../controllers/users.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// POST /api/users/register — upsert профиля после Firebase Auth регистрации/первого входа
router.post('/register', authenticate, usersController.register);

// GET /api/users/me — получить профиль текущего пользователя
router.get('/me', authenticate, usersController.getMe);

// PATCH /api/users/me — обновить профиль
router.patch('/me', authenticate, usersController.updateMe);

export default router;
