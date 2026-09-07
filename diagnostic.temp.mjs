// LECTURE SEULE : état déployé des règles et de l'application App Check.
import { cert, initializeApp } from 'firebase-admin/app';

const projet = process.env.FIREBASE_ADMIN_PROJECT_ID;
const app = initializeApp({
  credential: cert({
    projectId: projet,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\n/g, '\n'),
  }),
  projectId: projet,
});

const { access_token: jeton } = await app.options.credential.getAccessToken();
const entetes = { Authorization: `Bearer ${jeton}` };

console.log(`Projet : ${projet}\n`);

// --- 1. Quelles règles sont réellement déployées ?
const releases = await fetch(
  `https://firebaserules.googleapis.com/v1/projects/${projet}/releases`,
  { headers: entetes },
);
if (!releases.ok) {
  console.log(`Releases : HTTP ${releases.status} — ${(await releases.text()).slice(0, 200)}`);
} else {
  const donnees = await releases.json();
  const liste = donnees.releases ?? [];
  console.log(`=== Releases (${liste.length}) ===`);
  for (const release of liste) {
    console.log(`  ${release.name}`);
    console.log(`    ruleset  : ${release.rulesetName}`);
    console.log(`    créé le  : ${release.createTime}`);
    console.log(`    màj le   : ${release.updateTime}`);
  }

  const firestore = liste.find((r) => r.name.endsWith('cloud.firestore'));
  if (firestore) {
    const ruleset = await fetch(
      `https://firebaserules.googleapis.com/v1/${firestore.rulesetName}`,
      { headers: entetes },
    );
    if (ruleset.ok) {
      const contenu = await ruleset.json();
      const source = contenu.source?.files?.[0]?.content ?? '';
      console.log(`\n=== Règles déployées (${source.length} caractères) ===`);
      console.log(source.split('\n').slice(0, 24).join('\n'));
    }
  }
}

// --- 2. App Check est-il appliqué sur Firestore ?
const service = await fetch(
  `https://firebaseappcheck.googleapis.com/v1/projects/${projet}/services/firestore.googleapis.com`,
  { headers: entetes },
);
console.log(`\n=== App Check / Firestore ===`);
console.log(service.ok ? JSON.stringify(await service.json(), null, 2) : `HTTP ${service.status} — ${(await service.text()).slice(0, 200)}`);

process.exit(0);
