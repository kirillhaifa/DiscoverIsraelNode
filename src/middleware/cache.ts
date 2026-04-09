import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../config/redis';

export function cache(keyPrefix: string, ttlSeconds = 600) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = `${keyPrefix}:${req.originalUrl}`;

      const cached = await redisClient.get(key);

      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(JSON.parse(cached));
      }

      const originalJson = res.json.bind(res);

      res.json = (body: any) => {
        redisClient.setEx(key, ttlSeconds, JSON.stringify(body)).catch(() => {});
        res.setHeader('X-Cache', 'MISS');
        return originalJson(body);
      };

      next();
    } catch (err) {
      next();
    }
  };
}
