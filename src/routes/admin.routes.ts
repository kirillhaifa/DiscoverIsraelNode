import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { redisClient } from '../config/redis';

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

export default router;
