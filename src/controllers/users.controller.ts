import { Request, Response, NextFunction } from 'express';
import * as usersService from '../services/users.service';

/**
 * POST /api/users/register
 * Создаёт профиль пользователя если не существует (upsert).
 * Вызывается сразу после регистрации/первого входа через Firebase Auth.
 * Требует валидного Bearer токена.
 */
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const uid = req.user!.uid;
    const { name, surname, email, profilePicture, language, colorTheme } = req.body;

    const user = await usersService.createUserIfNotExists({
      userID: uid,
      name: name ?? null,
      surname: surname ?? null,
      email: email ?? req.user!.email ?? '',
      profilePicture: profilePicture ?? null,
      language,
      colorTheme,
    });

    res.status(200).json({ data: user });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/me
 * Возвращает профиль текущего пользователя.
 */
export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const uid = req.user!.uid;
    const user = await usersService.getUserById(uid);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/users/me
 * Обновляет разрешённые поля профиля (name, surname, profilePicture, language, colorTheme).
 */
export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const uid = req.user!.uid;
    const { name, surname, profilePicture, language, colorTheme } = req.body;

    const updated = await usersService.updateUser(uid, {
      name,
      surname,
      profilePicture,
      language,
      colorTheme,
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
}
