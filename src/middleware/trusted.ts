import { Request } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * Доверенный сервер: сборка и ISR фронта (Next), review-server.
 * Шлёт заголовок x-internal-key = INTERNAL_API_KEY. Такие запросы не ограничиваются по частоте
 * и могут брать полный список мест. Без INTERNAL_API_KEY в окружении доверенных нет.
 */
export function isInternalRequest(req: Request): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  const got = req.get('x-internal-key');
  if (!expected || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
