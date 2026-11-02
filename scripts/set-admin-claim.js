// Выдаёт пользователю custom claim role=admin — его проверяет requireAdmin в middleware/authenticate.ts.
// Роль в профиле Users на бэкенде не учитывается, нужен именно claim.
// Запуск из DiscoverIsraelNode:  node scripts/set-admin-claim.js user@example.com
// После этого пользователю нужно перелогиниться (или подождать до часа), чтобы токен обновился.
require('dotenv').config();
const admin = require('firebase-admin');

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/set-admin-claim.js <email>');
  process.exit(1);
}

const rawKey = process.env.FIREBASE_PRIVATE_KEY ?? '';
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey,
  }),
});

(async () => {
  const user = await admin.auth().getUserByEmail(email);
  console.log('before:', user.uid, JSON.stringify(user.customClaims ?? {}));
  await admin.auth().setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), role: 'admin' });
  const updated = await admin.auth().getUser(user.uid);
  console.log('after: ', JSON.stringify(updated.customClaims));
  process.exit(0);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
