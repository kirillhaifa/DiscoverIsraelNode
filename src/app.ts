import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import * as dotenv from 'dotenv';

dotenv.config();

import placesRoutes from './routes/places.routes';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import ratingsRoutes from './routes/ratings.routes';
import collectionsRoutes from './routes/collections.routes';
import wishlistRoutes from './routes/wishlist.routes';
import collectionGroupsRoutes from './routes/collectionGroups.routes';
import adminRoutes from './routes/admin.routes';
import { errorHandler } from './middleware/errorHandler';
import { isInternalRequest } from './middleware/trusted';

const app = express();

// Railway стоит перед приложением прокси: настоящий IP клиента берём из X-Forwarded-For (один прокси)
app.set('trust proxy', 1);

// --- Middleware ---
const configuredClientUrl = process.env.CLIENT_URL;
const allowedOrigins = [
  configuredClientUrl,
  'http://localhost:3000',
  'http://localhost:3007',
  'http://localhost:8081',
  'http://localhost:5173',
  'https://kirillhaifa.github.io'
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, true); // allow temporarily to avoid blocking
  },
  methods: ['GET','POST','PUT','PATCH','DELETE'],
  credentials: true
}));

app.use(express.json());

// Сжатие ответов (gzip): JSON с текстами в 5–10 раз меньше. Мелкие ответы до 1 КБ не сжимаем — выигрыша нет
app.use(compression({ threshold: 1024 }));

// Ограничение частоты с одного IP: защита от ботов и зацикленных скриптов, живой человек до лимита не доходит.
// Сборка и ISR фронта и review-server ходят с x-internal-key — их не ограничиваем (см. middleware/trusted.ts)
const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE) || 300;
app.use('/api', rateLimit({
  windowMs: 60_000,
  limit: RATE_LIMIT_PER_MINUTE,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || isInternalRequest(req),
  message: { error: 'Too many requests, try again in a minute' },
}));

// --- Routes ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/places', placesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/users/me/wishlist', wishlistRoutes);
app.use('/api/ratings', ratingsRoutes);
app.use('/api/collections', collectionsRoutes);
app.use('/api/collection-groups', collectionGroupsRoutes);
app.use('/api/admin', adminRoutes);

// --- Error handler (должен быть последним) ---
app.use(errorHandler);

export default app;
