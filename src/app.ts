import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';

dotenv.config();

import placesRoutes from './routes/places.routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// --- Middleware ---
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

// --- Routes ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/places', placesRoutes);

// --- Error handler (должен быть последним) ---
app.use(errorHandler);

export default app;
