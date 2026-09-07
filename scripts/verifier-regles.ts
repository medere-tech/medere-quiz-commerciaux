/**
 * Vérification des règles Firestore déployées.
 *
 * Le 3 septembre 2026, tout le back-office était inutilisable : les règles
 * déployées étaient encore celles par défaut — `allow read, write: if false` —
 * alors que le dépôt portait 300 lignes de règles validées par 297 tests
 * d'émulateur. Les tests passaient, le build passait, la synchronisation
 * fonctionnait (le SDK Admin ignore les règles), et aucune lecture du
 * navigateur n'aboutissait.
 *
 * Rien ne signalait l'écart. Ce script le signale.
 *
 * Usage :
 *   node --env-file=.env.local scripts/verifier-regles.ts
 *   node --env-file=.env.local scripts/verifier-regles.ts --projet=<id>
 *
 * Sortie en erreur si les règles déployées diffèrent de `firestore.rules`.
 * À exécuter après tout déploiement, et avant de conclure qu'un écran
 * fonctionne.
 */

import { readFileSync } from 'node:fs';

import { cert, initializeApp } from 'firebase-admin/app';

const RACINE = 'https://firebaserules.googleapis.com/v1';

function argument(nom: string): string | undefined {
  const prefixe = `--${nom}=`;
  return process.argv.find((valeur) => valeur.startsWith(prefixe))?.slice(prefixe.length);
}

/** Les écarts de fin de ligne ou d'espaces finaux ne sont pas des écarts. */
function normaliser(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((ligne) => ligne.trimEnd())
    .join('\n')
    .trim();
}

async function principal(): Promise<void> {
  const projet = argument('projet') ?? process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const clePrivee = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projet || !clientEmail || !clePrivee) {
    throw new Error(
      `Configuration incomplète. Attendu : FIREBASE_ADMIN_PROJECT_ID, ` +
        `FIREBASE_ADMIN_CLIENT_EMAIL et FIREBASE_ADMIN_PRIVATE_KEY. ` +
        `Lancez le script avec node --env-file=.env.local.`,
    );
  }

  const application = initializeApp({
    credential: cert({
      projectId: projet,
      clientEmail,
      privateKey: clePrivee.replace(/\\n/g, '\n'),
    }),
    projectId: projet,
  });

  const { access_token: jeton } = await application.options.credential!.getAccessToken();
  const entetes = { Authorization: `Bearer ${jeton}` };

  const reponseReleases = await fetch(`${RACINE}/projects/${projet}/releases`, {
    headers: entetes,
  });

  if (!reponseReleases.ok) {
    throw new Error(
      `Impossible de lire les règles déployées (HTTP ${reponseReleases.status}). ` +
        `Le compte de service a-t-il le rôle « Lecteur des règles Firebase » ?`,
    );
  }

  const donnees = (await reponseReleases.json()) as {
    releases?: { name: string; rulesetName: string; updateTime: string }[];
  };

  const publication = donnees.releases?.find((release) => release.name.endsWith('cloud.firestore'));

  if (!publication) {
    console.error(
      `Aucune règle Firestore n'est publiée sur « ${projet} ». ` +
        `Déployez-les : npm run regles:deploy`,
    );
    process.exitCode = 1;
    return;
  }

  const reponseRuleset = await fetch(`${RACINE}/${publication.rulesetName}`, { headers: entetes });
  if (!reponseRuleset.ok) {
    throw new Error(`Impossible de lire le jeu de règles (HTTP ${reponseRuleset.status}).`);
  }

  const ruleset = (await reponseRuleset.json()) as {
    source?: { files?: { content?: string }[] };
  };

  const deployees = normaliser(ruleset.source?.files?.[0]?.content ?? '');
  const locales = normaliser(readFileSync('firestore.rules', 'utf8'));

  console.log(`Projet          : ${projet}`);
  console.log(`Publié le       : ${publication.updateTime}`);
  console.log(`Déployé         : ${deployees.length} caractères`);
  console.log(`firestore.rules : ${locales.length} caractères`);

  if (deployees === locales) {
    console.log('\nLes règles déployées sont exactement celles du dépôt.');
    return;
  }

  console.error('\nLes règles déployées DIFFÈRENT de firestore.rules.');

  // Le cas le plus courant, et le plus coûteux : la base est restée en
  // refus par défaut. Il mérite d'être nommé.
  if (deployees.includes('allow read, write: if false') && deployees.length < 400) {
    console.error(
      `\nLa base porte encore les règles par défaut du mode production : ` +
        `tout est refusé. Le SDK Admin les ignore, donc les routes serveur ` +
        `fonctionnent et les tests d'émulateur passent — mais aucune lecture ` +
        `depuis un navigateur n'aboutit.`,
    );
  }

  const lignesDeployees = deployees.split('\n');
  const lignesLocales = locales.split('\n');
  const premiereDifference = lignesLocales.findIndex(
    (ligne, index) => ligne !== lignesDeployees[index],
  );

  if (premiereDifference >= 0) {
    console.error(`\nPremière différence, ligne ${premiereDifference + 1} :`);
    console.error(`  dépôt   : ${lignesLocales[premiereDifference]}`);
    console.error(`  déployé : ${lignesDeployees[premiereDifference] ?? '(fin du fichier)'}`);
  }

  console.error('\nDéployez les règles du dépôt : npm run regles:deploy');
  process.exitCode = 1;
}

principal().catch((erreur: unknown) => {
  console.error(`\nÉchec de la vérification : ${(erreur as Error).message}`);
  process.exitCode = 1;
});
