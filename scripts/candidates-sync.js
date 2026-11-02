// Обмен между placeCandidates и локальным place-pipeline, где нет firebase-admin.
//
//   node scripts/candidates-sync.js pull <file.json> [batch]         — выгрузить кандидатов в файл
//   node scripts/candidates-sync.js pull-status <file.json> <a,b>    — только с этими статусами
//   node scripts/candidates-sync.js pull-ids <file.json> <ids.json>  — только эти id
//   node scripts/candidates-sync.js push <file.json>                 — применить обновления [{ id, patch }]
//   node scripts/candidates-sync.js move <id> <from,from2> <to>      — сменить статус, если текущий из списка
//
// patch пишется через update: поля с точкой (stages.value) меняют только свой этап.

require('dotenv').config({ quiet: true });
const fs = require('fs');
const admin = require('firebase-admin');

const [, , command, file, batch, target] = process.argv;
if (!['pull', 'pull-status', 'pull-ids', 'push', 'move'].includes(command) || !file) {
  console.error('Usage: node scripts/candidates-sync.js pull|pull-status|pull-ids|push|move ...');
  process.exit(1);
}

const rawKey = process.env.FIREBASE_PRIVATE_KEY ?? '';
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: rawKey.replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();
const collection = db.collection('placeCandidates');

function save(docs) {
  fs.writeFileSync(file, JSON.stringify(docs.map((d) => ({ id: d.id, ...d.data() })), null, 2));
  console.log(`✓ выгружено ${docs.length}`);
}

async function pull() {
  save((await (batch ? collection.where('batch', '==', batch) : collection).get()).docs);
}

async function pullStatus() {
  save((await collection.where('status', 'in', batch.split(',')).get()).docs);
}

async function pullIds() {
  const ids = JSON.parse(fs.readFileSync(batch, 'utf8'));
  save((await db.getAll(...ids.map((id) => collection.doc(id)))).filter((d) => d.exists));
}

async function push() {
  const updates = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const { id, patch } of updates) {
    await collection.doc(id).update({ ...patch, updatedAt: new Date().toISOString() });
  }
  console.log(`✓ обновлено ${updates.length}`);
}

async function move() {
  const ref = collection.doc(file);
  const snap = await ref.get();
  if (!batch.split(',').includes(snap.data()?.status)) throw new Error(`${file}: статус ${snap.data()?.status}, ожидался ${batch}`);
  // Предусловие вместо транзакции: запись не пройдёт, если документ изменился после чтения
  await ref.update({ status: target, updatedAt: new Date().toISOString() }, { lastUpdateTime: snap.updateTime });
  console.log(`✓ ${file}: ${target}`);
}

const commands = { pull, 'pull-status': pullStatus, 'pull-ids': pullIds, push, move };
commands[command]().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
