import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';

dotenv.config();

import placesRoutes from './routes/places.routes';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// --- Middleware ---
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://kirillhaifa.github.io'
];

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

// --- Error handler (должен быть последним) ---
app.use(errorHandler);

export default app;
