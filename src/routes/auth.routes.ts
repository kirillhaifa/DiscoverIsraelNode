import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';

const router = Router();

/**
 * GET /api/auth/me
 * Проверяет токен и возвращает данные текущего пользователя.
 * Используется фронтендом для проверки авторизации.
 */
router.get('/me', authenticate, (req, res) => {
  res.json({
    uid: req.user!.uid,
    email: req.user!.email,
    role: req.user!.role,
  });
});

export default router;
