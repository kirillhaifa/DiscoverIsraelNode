import { Request, Response, NextFunction } from 'express';
import {
  getAllCollections,
  getPublicCollections,
  getUserCollections,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection,
} from '../services/collections.service';

/**
 * GET /api/collections
 * Публичные коллекции — доступны всем (без аутентификации).
 */
export async function listPublicCollections(req: Request, res: Response, next: NextFunction) {
  try {
    const collections = await getPublicCollections();
    res.json({ data: collections });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/collections/all
 * Все коллекции — только admin.
 */
export async function listAllCollections(req: Request, res: Response, next: NextFunction) {
  try {
    const collections = await getAllCollections();
    res.json({ data: collections });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/collections/my
 * Коллекции текущего пользователя.
 */
export async function listMyCollections(req: Request, res: Response, next: NextFunction) {
  try {
    const uid = (req as any).user.uid;
    const collections = await getUserCollections(uid);
    res.json({ data: collections });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/collections/:id
 */
export async function getCollection(req: Request, res: Response, next: NextFunction) {
  try {
    const collection = await getCollectionById(req.params.id as string);
    if (!collection) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }
    res.json({ data: collection });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/collections
 * Создать коллекцию (авторизованный пользователь).
 */
export async function createCollectionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const uid = (req as any).user.uid;
    const collection = await createCollection(req.body, uid);
    res.status(201).json({ data: collection });
  } catch (error) {
    next(error);
  }
}
/**
 * PATCH /api/collections/:id
 * Обновить коллекцию (только admin).
 */
export async function updateCollectionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const updated = await updateCollection(req.params.id as string, req.body);
    if (!updated) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }
    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/collections/:id
 * Удалить коллекцию (только admin).
 */
export async function deleteCollectionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteCollection(req.params.id as string);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}