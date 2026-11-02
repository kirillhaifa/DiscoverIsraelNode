// Запись кандидатов в placeCandidates. Только создаёт новые документы:
// существующие не меняются, поэтому статусы этапов при повторном запуске не сбрасываются.
//
//   node scripts/upload-candidates.js <file.json> --dry
//   node scripts/upload-candidates.js <file.json>

require('dotenv').config();
const fs = require('fs');
const admin = require('firebase-admin');

const file = process.argv[2];
const dry = process.argv.includes('--dry');
if (!file) {
  console.error('Usage: node scripts/upload-candidates.js <file.json> [--dry]');
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
const COLLECTION = 'placeCandidates';

const docId = (id) => id.replace(/[:/]/g, '-');
const now = () => new Date().toISOString();

function toDoc(c) {
  return {
    sourceKey: c.id,
    batch: c.batch || null,
    status: 'in_progress',
    stage: 'dedupe',
    stages: {},
    kind: c.kind,
    name: c.name,
    coordinates: c.coordinates,
    sources: c.sources,
    confirmedBy: c.confirmedBy,
    wikidata: c.wikidata,
    website: c.website,
    needsName: Boolean(c.needsName),
    hasGrill: Boolean(c.hasGrill),
    createdAt: now(),
    updatedAt: now(),
  };
}

async function main() {
  const candidates = JSON.parse(fs.readFileSync(file, 'utf8'));
  const existing = await db.collection(COLLECTION).count().get();
  console.log(`${COLLECTION}: ${existing.data().count} документов, в файле ${candidates.length}`);
  if (dry) {
    console.log(JSON.stringify({ id: docId(candidates[0].id), ...toDoc(candidates[0]) }, null, 2));
    return;
  }
  let created = 0, skipped = 0;
  for (const c of candidates) {
    try {
      await db.collection(COLLECTION).doc(docId(c.id)).create(toDoc(c));
      created++;
    } catch (e) {
      if (e.code !== 6) throw e; // 6: документ уже есть
      skipped++;
    }
  }
  console.log(`✓ создано ${created}, уже были ${skipped}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
