import app from './app';

const PORT = process.env.PORT || 3001;

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Places: http://localhost:${PORT}/api/places`);
});
