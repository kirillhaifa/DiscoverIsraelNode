// controllers/collectionGroups.controller.ts
import { Request, Response, NextFunction } from 'express';
import {
  getPublicCollectionGroups,
  getAllCollectionGroups,
  getCollectionGroupById,
  createCollectionGroup,
  updateCollectionGroup,
  deleteCollectionGroup,
} from '../services/collectionGroups.service';

/** GET /api/collection-groups — публичные группы (без авторизации) */
export async function listPublicGroups(req: Request, res: Response, next: NextFunction) {
  try {
    const groups = await getPublicCollectionGroups();
    res.json({ data: groups });
  } catch (e) { next(e); }
}

/** GET /api/collection-groups/all — все (только admin) */
export async function listAllGroups(req: Request, res: Response, next: NextFunction) {
  try {
    const groups = await getAllCollectionGroups();
    res.json({ data: groups });
  } catch (e) { next(e); }
}

/** GET /api/collection-groups/:id */
export async function getGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const group = await getCollectionGroupById(req.params['id'] as string);
    if (!group) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ data: group });
  } catch (e) { next(e); }
}

/** POST /api/collection-groups — создать (только admin) */
export async function createGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const group = await createCollectionGroup(req.body);
    res.status(201).json({ data: group });
  } catch (e) { next(e); }
}

/** PATCH /api/collection-groups/:id — обновить (только admin) */
export async function updateGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const group = await updateCollectionGroup(req.params['id'] as string, req.body);
    if (!group) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ data: group });
  } catch (e) { next(e); }
}

/** DELETE /api/collection-groups/:id — удалить (только admin) */
export async function deleteGroup(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteCollectionGroup(req.params['id'] as string);
    res.status(204).send();
  } catch (e) { next(e); }
}
