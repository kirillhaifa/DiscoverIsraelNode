import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';

dotenv.config();

import placesRoutes from './routes/places.routes';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import ratingsRoutes from './routes/ratings.routes';
import collectionsRoutes from './routes/collections.routes';
import wishlistRoutes from './routes/wishlist.routes';
import collectionGroupsRoutes from './routes/collectionGroups.routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

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

// --- Error handler (должен быть последним) ---
app.use(errorHandler);

export default app;
