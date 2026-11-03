import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { redisClient } from '../config/redis';
import { getModerationCandidates, moveCandidate, MODERATION_MOVES, MODERATION_PAGE_MAX } from '../services/candidates.service';

const router = Router();

/**
 * POST /api/admin/cache/clear
 * Body: { keys: string[] }  — список ключей Redis для инвалидации.
 * Если keys не передан — очищает все известные публичные кэши.
 *
 * Известные ключи:
 *   collections:public
 *   collectionGroups:public
 *   places:all
 */
const KNOWN_CACHE_KEYS = ['collections:public', 'collectionGroups:public', 'places:all'];

router.post(
  '/cache/clear',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const keys: string[] = Array.isArray(req.body.keys)
        ? req.body.keys
        : KNOWN_CACHE_KEYS;

      const results: Record<string, number> = {};
      for (const key of keys) {
        results[key] = await redisClient.del(key);
      }

      res.json({ success: true, deleted: results });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/admin/moderation?limit=20&after=<id>
 * Страница мест на модерации и с готовым переводом из placeCandidates.
 * Ответ: { data, total, nextCursor }. Следующая страница: after=nextCursor.
 */
router.get(
  '/moderation',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(Math.max(parseInt(String(req.query.limit), 10) || 20, 1), MODERATION_PAGE_MAX);
      const after = typeof req.query.after === 'string' && req.query.after ? req.query.after : undefined;
      res.json({ success: true, ...(await getModerationCandidates(limit, after)) });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/moderation/:id/status
 * Body: { to: string }  — новый статус кандидата, см. MODERATION_MOVES.
 */
router.post(
  '/moderation/:id/status',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { to } = req.body;
      if (!Object.prototype.hasOwnProperty.call(MODERATION_MOVES, to)) {
        res.status(400).json({ success: false, error: `Неизвестный статус ${to}` });
        return;
      }
      if (!(await moveCandidate(String(req.params.id), to))) {
        res.status(409).json({ success: false, error: 'Статус места уже изменился' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
