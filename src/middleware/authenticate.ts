import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../config/firebase';

export interface AuthUser {
  uid: string;
  email: string | undefined;
  role: 'admin' | 'user';
}

// Расширяем тип Request чтобы хранить user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Обязательная авторизация — вернёт 401 если токен отсутствует или невалиден,
 * 403 если почта не подтверждена (кроме админов).
 */
export function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  return verifyUser(req, res, next, false);
}

/**
 * Как authenticate, но пускает с неподтверждённой почтой: профиль создаётся до перехода по ссылке из письма.
 */
export function authenticateUnverified(req: Request, res: Response, next: NextFunction): Promise<void> {
  return verifyUser(req, res, next, true);
}

async function verifyUser(
  req: Request,
  res: Response,
  next: NextFunction,
  allowUnverified: boolean,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7); // убираем "Bearer "

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const role = decoded.role === 'admin' ? 'admin' : 'user';
  if (!allowUnverified && decoded.email_verified !== true && role !== 'admin') {
    res.status(403).json({ error: 'Email not verified' });
    return;
  }

  req.user = { uid: decoded.uid, email: decoded.email, role };
  next();
}

/**
 * Только для администраторов — используй ПОСЛЕ authenticate.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

/**
 * Опциональная авторизация — не возвращает ошибку если токена нет,
 * но добавляет req.user если токен валиден.
 * Используется для эндпоинтов которые доступны всем, но ведут себя
 * по-разному для авторизованных (например: GET /api/places + отметка посещённых)
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        role: decoded.role === 'admin' ? 'admin' : 'user',
      };
    } catch {
      // токен невалиден — просто игнорируем, req.user останется undefined
    }
  }

  next();
}
