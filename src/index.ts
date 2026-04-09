import app from './app';
import { connectRedis } from './config/redis';

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

const PORT = Number(process.env.PORT) || 8080;

async function start() {
  await connectRedis();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    console.log(`   Places: http://localhost:${PORT}/api/places`);
  });
}

start();
