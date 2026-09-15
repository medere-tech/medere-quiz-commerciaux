/**
 * Effacement des données de recette, avant l'ouverture aux commerciaux.
 *
 * **Pourquoi ce script existe.** Sept lots ont été recettés sur la base réelle.
 * Il y reste des réponses, une progression, des étoiles, des prix, des
 * questions d'essai, des séances de recette — dont `CPY68N`, jamais close, que
 * `maSessionEnCours` retrouve et qui s'ouvrirait à la place d'un écran neuf —
 * et un `questionStats` bâti sur tout cela. **Un commercial qui découvre
 * l'outil ne doit rien hériter de ces essais** : ni un classement où il est
 * dernier derrière des comptes de test, ni des taux d'échec calculés sur les
 * réponses de l'équipe pédagogique.
 *
 * **C'est irréversible, et Firestore n'a pas de corbeille.** D'où trois
 * précautions qui ne se négocient pas :
 *
 *   1. **L'essai à blanc est le comportement par défaut.** Sans `--confirmer`,
 *      le script lit, affiche et ne touche à rien.
 *   2. **La confirmation est explicite et typée.** `--confirmer=EFFACER`, pas
 *      un simple drapeau : un `--confirmer` seul se tape par réflexe à la fin
 *      d'une ligne qu'on a déjà lancée dix fois.
 *   3. **Chaque périmètre s'active séparément.** Rien n'est effacé « aussi, tant
 *      qu'on y est ». En particulier, **aucune question n'est supprimée sans
 *      être nommée** : la banque contient déjà des questions écrites par
 *      Noémie, et seul un humain distingue un essai d'une vraie question.
 *
 * **Ce à quoi il ne touche pas, et pourquoi :**
 *
 *   - `formations` — le miroir Airtable. Il se reconstruit par synchronisation,
 *     et Airtable est en lecture seule : rien à effacer ici.
 *   - Les comptes Firebase Authentication. Effacer le document `users/{uid}`
 *     remet la progression à zéro ; effacer le compte déconnecterait aussi les
 *     administrateurs et ferait perdre les custom claims, qui ne se
 *     réattribuent pas tout seuls.
 *   - `questions` sans `--questions=…`. Voir plus haut.
 *
 * Usage :
 *   node --env-file=.env.local scripts/nettoyer-recette.ts
 *   node --env-file=.env.local scripts/nettoyer-recette.ts --questions=toutes
 *   node --env-file=.env.local scripts/nettoyer-recette.ts --confirmer=EFFACER
 *   node --env-file=.env.local scripts/nettoyer-recette.ts --seances --confirmer=EFFACER
 *
 * Périmètres (aucun n'est activé quand on en nomme au moins un ; tous le sont
 * quand on n'en nomme aucun, sauf `--questions`, toujours explicite) :
 *   --progression   réponses, états, étoiles, séries terminées, prix
 *   --seances       toutes les séances collectives et leur contenu
 *   --statistiques  questionStats et ses marqueurs d'événements
 *   --synchros      le journal des synchronisations Airtable
 *   --questions=…   « toutes », ou des identifiants séparés par des virgules
 */

import { createInterface } from 'node:readline/promises';

import { cert, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type CollectionReference,
  type Firestore,
  type Timestamp,
} from 'firebase-admin/firestore';

const PERIMETRES = ['progression', 'seances', 'statistiques', 'synchros'] as const;
type Perimetre = (typeof PERIMETRES)[number];

const MOT_DE_CONFIRMATION = 'EFFACER';

type Plan = {
  /** Chemins des documents qui partiraient, dans l'ordre d'affichage. */
  chemins: string[];
  /** Ce qu'on en dit à l'écran, une ligne par élément reconnaissable. */
  lignes: string[];
};

function argument(nom: string): string | undefined {
  const prefixe = `--${nom}=`;
  const exact = process.argv.find((valeur) => valeur === `--${nom}`);
  if (exact) return '';
  return process.argv.find((valeur) => valeur.startsWith(prefixe))?.slice(prefixe.length);
}

function base(): Firestore {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST est défini : ce script vise la base réelle, ' +
        'pas l’émulateur. Retirez la variable et relancez.',
    );
  }

  const projet = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const clePrivee = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projet || !clientEmail || !clePrivee) {
    throw new Error(
      'Configuration incomplète. Attendu : FIREBASE_ADMIN_PROJECT_ID, ' +
        'FIREBASE_ADMIN_CLIENT_EMAIL et FIREBASE_ADMIN_PRIVATE_KEY. ' +
        'Lancez le script avec node --env-file=.env.local.',
    );
  }

  return getFirestore(
    initializeApp({
      credential: cert({ projectId: projet, clientEmail, privateKey: clePrivee.replace(/\\n/g, '\n') }),
      projectId: projet,
    }),
  );
}

function date(valeur: unknown): string {
  const horodatage = valeur as Timestamp | undefined;
  if (typeof horodatage?.toMillis !== 'function') return 'date inconnue';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(horodatage.toMillis()),
  );
}

function tronquer(texte: unknown, longueur = 60): string {
  const chaine = typeof texte === 'string' ? texte : '';
  return chaine.length > longueur ? `${chaine.slice(0, longueur - 1)}…` : chaine;
}

/** Tous les documents d'une collection et de ses sous-collections connues. */
async function sousArbre(collection: CollectionReference): Promise<string[]> {
  const chemins: string[] = [];

  for (const document of await collection.listDocuments()) {
    for (const enfant of await document.listCollections()) {
      chemins.push(...(await sousArbre(enfant)));
    }
    chemins.push(document.path);
  }

  return chemins;
}

/* ------------------------------------------------------- les périmètres */

/**
 * La progression individuelle : réponses, états, prix, étoiles.
 *
 * **Le document `users/{uid}` n'est pas supprimé, il est remis à zéro.** Il
 * porte l'email, le nom et la photo, qui sont recréés à la connexion, mais
 * aussi le nom de séance et l'avatar choisis. Le supprimer marcherait ; le
 * remettre à zéro dit mieux ce qu'on fait, et évite qu'un compte existant se
 * retrouve sans document le temps d'une reconnexion.
 */
async function planProgression(db: Firestore): Promise<Plan & { remisesAZero: string[] }> {
  const chemins: string[] = [];
  const lignes: string[] = [];
  const remisesAZero: string[] = [];

  for (const utilisateur of await db.collection('users').listDocuments()) {
    const donnees = (await utilisateur.get()).data() ?? {};
    let comptes = 0;

    for (const sous of ['reponses', 'etats', 'prix']) {
      const enfants = await utilisateur.collection(sous).listDocuments();
      comptes += enfants.length;
      chemins.push(...enfants.map((enfant) => enfant.path));
    }

    const etoiles = typeof donnees.etoiles === 'number' ? donnees.etoiles : 0;
    const series = typeof donnees.seriesTerminees === 'number' ? donnees.seriesTerminees : 0;

    if (comptes === 0 && etoiles === 0 && series === 0) continue;

    remisesAZero.push(utilisateur.id);
    lignes.push(
      `  ${String(donnees.email ?? utilisateur.id).padEnd(34)} ${String(comptes).padStart(4)} document(s) · ` +
        `${etoiles} étoile(s) · ${series} série(s) terminée(s)`,
    );
  }

  return { chemins, lignes, remisesAZero };
}

/** Les séances collectives, leur contenu, et ce que la Cloud Function en a tiré. */
async function planSeances(db: Firestore): Promise<Plan> {
  const chemins: string[] = [];
  const lignes: string[] = [];

  for (const seance of await db.collection('sessions').listDocuments()) {
    const donnees = (await seance.get()).data() ?? {};
    let contenu = 0;

    for (const sous of await seance.listCollections()) {
      const enfants = await sous.listDocuments();
      contenu += enfants.length;
      chemins.push(...enfants.map((enfant) => enfant.path));
    }

    chemins.push(seance.path);

    // Le statut est dit en toutes lettres : c'est ce qui permet de reconnaître
    // `CPY68N`, restée `encours`, dans une liste de séances closes.
    const statut = String(donnees.statut ?? '?');
    const alerte = statut === 'encours' || statut === 'pause' ? '  ← jamais close' : '';
    lignes.push(
      `  ${String(donnees.code ?? seance.id).padEnd(10)} ${statut.padEnd(11)} ` +
        `${date(donnees.creeeLe).padEnd(18)} ${String(contenu).padStart(3)} document(s)${alerte}`,
    );
  }

  return { chemins, lignes };
}

/** L'agrégat anonyme et ses marqueurs d'événements. */
async function planStatistiques(db: Firestore): Promise<Plan> {
  const chemins = await sousArbre(db.collection('questionStats'));
  const agregats = chemins.filter((chemin) => chemin.split('/').length === 2);

  return {
    chemins,
    lignes: [
      `  ${agregats.length} agrégat(s) et ${chemins.length - agregats.length} marqueur(s) d’événement`,
    ],
  };
}

/** Le journal des synchronisations Airtable. Aucune donnée métier. */
async function planSynchros(db: Firestore): Promise<Plan> {
  const chemins = await sousArbre(db.collection('synchronisations'));
  return { chemins, lignes: [`  ${chemins.length} exécution(s) journalisée(s)`] };
}

/**
 * Les questions nommées, et elles seules.
 *
 * `--questions=toutes` vide la banque. `--questions=id1,id2` n'ôte que
 * celles-là. Sans l'argument, aucune question ne part : la banque contient
 * déjà du travail de Noémie, et rien dans le document ne distingue un essai
 * d'une vraie question.
 */
async function planQuestions(db: Firestore, selection: string): Promise<Plan> {
  const toutes = await db.collection('questions').get();
  const demandees =
    selection === 'toutes'
      ? toutes.docs.map((document) => document.id)
      : selection
          .split(',')
          .map((valeur) => valeur.trim())
          .filter(Boolean);

  const chemins: string[] = [];
  const lignes: string[] = [];
  const introuvables: string[] = [];

  for (const id of demandees) {
    const document = toutes.docs.find((candidat) => candidat.id === id);
    if (!document) {
      introuvables.push(id);
      continue;
    }
    chemins.push(document.ref.path);
    lignes.push(
      `  ${id.padEnd(22)} ${String(document.data().statut ?? '?').padEnd(10)} ` +
        `${tronquer(document.data().enonce)}`,
    );
  }

  if (introuvables.length > 0) {
    throw new Error(
      `Questions introuvables : ${introuvables.join(', ')}. ` +
        `Aucune suppression n'a été tentée — vérifiez les identifiants.`,
    );
  }

  return { chemins, lignes };
}

/* ------------------------------------------------------------- effacement */

const ECRITURES_PAR_LOT = 400;

async function effacer(db: Firestore, chemins: string[]): Promise<void> {
  for (let debut = 0; debut < chemins.length; debut += ECRITURES_PAR_LOT) {
    const lot = db.batch();
    for (const chemin of chemins.slice(debut, debut + ECRITURES_PAR_LOT)) {
      lot.delete(db.doc(chemin));
    }
    await lot.commit();
    console.log(`  ${Math.min(debut + ECRITURES_PAR_LOT, chemins.length)} / ${chemins.length}`);
  }
}

async function remettreAZero(db: Firestore, uids: string[]): Promise<void> {
  const lot = db.batch();
  for (const uid of uids) {
    lot.update(db.collection('users').doc(uid), {
      etoiles: 0,
      seriesTerminees: 0,
    });
  }
  await lot.commit();
}

/* ------------------------------------------------------------- programme */

async function principal(): Promise<void> {
  const nommes = PERIMETRES.filter((perimetre) => argument(perimetre) !== undefined);
  const actifs: Perimetre[] = nommes.length > 0 ? nommes : [...PERIMETRES];
  const questions = argument('questions');
  const confirmation = argument('confirmer');

  const db = base();

  console.log(`Projet : ${process.env.FIREBASE_ADMIN_PROJECT_ID}`);
  console.log(`Périmètres : ${actifs.join(', ')}${questions !== undefined ? ', questions' : ''}\n`);

  const chemins: string[] = [];
  let remisesAZero: string[] = [];

  if (actifs.includes('progression')) {
    const plan = await planProgression(db);
    remisesAZero = plan.remisesAZero;
    console.log('PROGRESSION — réponses, états, prix, étoiles, séries');
    console.log(plan.lignes.length > 0 ? plan.lignes.join('\n') : '  (rien)');
    console.log();
    chemins.push(...plan.chemins);
  }

  if (actifs.includes('seances')) {
    const plan = await planSeances(db);
    console.log('SÉANCES COLLECTIVES — séances, votes, présences, bilans, classements');
    console.log(plan.lignes.length > 0 ? plan.lignes.join('\n') : '  (rien)');
    console.log();
    chemins.push(...plan.chemins);
  }

  if (actifs.includes('statistiques')) {
    const plan = await planStatistiques(db);
    console.log('STATISTIQUES — questionStats');
    console.log(plan.lignes.join('\n'));
    console.log();
    chemins.push(...plan.chemins);
  }

  if (actifs.includes('synchros')) {
    const plan = await planSynchros(db);
    console.log('SYNCHRONISATIONS — journal des imports Airtable');
    console.log(plan.lignes.join('\n'));
    console.log();
    chemins.push(...plan.chemins);
  }

  if (questions !== undefined) {
    const plan = await planQuestions(db, questions);
    console.log('QUESTIONS — suppression définitive de la banque');
    console.log(plan.lignes.length > 0 ? plan.lignes.join('\n') : '  (rien)');
    console.log();
    chemins.push(...plan.chemins);
  } else {
    console.log(
      'QUESTIONS — aucune. Pour en supprimer, nommez-les :\n' +
        '  --questions=toutes  ou  --questions=<id>,<id>\n',
    );
  }

  console.log(
    `TOTAL : ${chemins.length} document(s) à supprimer, ` +
      `${remisesAZero.length} compte(s) à remettre à zéro.`,
  );

  if (chemins.length === 0 && remisesAZero.length === 0) {
    console.log('\nRien à faire.');
    return;
  }

  if (confirmation !== MOT_DE_CONFIRMATION) {
    console.log(
      `\nESSAI À BLANC — rien n'a été touché.\n` +
        `Pour exécuter : ajoutez --confirmer=${MOT_DE_CONFIRMATION} à la même commande.\n` +
        `Firestore n'a pas de corbeille : relisez la liste ci-dessus d'abord.`,
    );
    return;
  }

  /*
   * Deuxième barrière, et elle n'est pas redondante avec la première.
   *
   * `--confirmer=EFFACER` passe dans l'historique du terminal : la flèche du
   * haut suffit à rejouer un effacement. La saisie du nom du projet, elle, se
   * fait à la main, après avoir vu la liste, et sur la base qu'on vise
   * vraiment — c'est la dernière occasion de s'apercevoir qu'on est sur la
   * production alors qu'on croyait être ailleurs.
   */
  const console_ = createInterface({ input: process.stdin, output: process.stdout });
  const saisi = await console_.question(
    `\nTapez le nom du projet pour confirmer (${process.env.FIREBASE_ADMIN_PROJECT_ID}) : `,
  );
  console_.close();

  if (saisi.trim() !== process.env.FIREBASE_ADMIN_PROJECT_ID) {
    console.log('Nom du projet non confirmé. Rien n’a été touché.');
    process.exitCode = 1;
    return;
  }

  console.log('\nSuppression :');
  await effacer(db, chemins);

  if (remisesAZero.length > 0) {
    console.log(`Remise à zéro de ${remisesAZero.length} compte(s).`);
    await remettreAZero(db, remisesAZero);
  }

  console.log(
    '\nTerminé.\n' +
      'Rappel : les comptes Firebase Authentication et leurs custom claims sont intacts, ' +
      'et `formations` aussi — il se reconstruit par synchronisation Airtable.',
  );
}

principal().catch((erreur: unknown) => {
  console.error(erreur instanceof Error ? erreur.message : erreur);
  process.exitCode = 1;
});
