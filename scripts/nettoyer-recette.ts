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
 *   node --env-file=.env.local scripts/nettoyer-recette.ts --orphelins
 *   node --env-file=.env.local scripts/nettoyer-recette.ts --references
 *
 * Périmètres (aucun n'est activé quand on en nomme au moins un ; tous le sont
 * quand on n'en nomme aucun, sauf `--questions`, toujours explicite) :
 *   --progression   réponses, états, étoiles, séries terminées, prix
 *   --seances       toutes les séances collectives et leur contenu
 *   --statistiques  questionStats et ses marqueurs d'événements
 *   --synchros      le journal des synchronisations Airtable
 *   --orphelins     les documents users/ dont le compte Authentication a disparu
 *   --references    les séances et questionStats qui pointent vers une question effacée
 *   --questions=…   « toutes », ou des identifiants séparés par des virgules
 *
 * **`--references` ne supprime aucune séance, il la recoud.** C'est le seul
 * périmètre qui *modifie* au lieu d'effacer : il retire d'une séance les
 * identifiants de questions qui n'existent plus, et recale `indexCourant` en
 * conséquence. Les agrégats `questionStats` sans question, eux, sont effacés.
 *
 * Deux séances lui échappent, et il les nomme au lieu de les taire :
 *   - **Celles déjà jouées** — terminées, abandonnées. Leur liste est un
 *     compte rendu : Noémie a vu neuf questions passer ce jour-là, son
 *     historique doit le dire. Réécrire le passé pour réparer le présent
 *     serait un mauvais échange.
 *   - **Celles qui se retrouveraient sans aucune question.** Une séance vide
 *     est un document que l'application ne sait pas afficher, et le choix
 *     entre la supprimer et la recomposer revient à Noémie.
 *
 * **Et un contrôle qui n'efface rien**, affiché à chaque lancement : les prix
 * qui renvoient à une séance absente de la base. Un prix porte son code, son
 * rang et sa date en dur — il survit très bien à sa séance, et on ne le
 * supprime pas au passage. Mais on le dit, parce qu'une incohérence que rien
 * ne signale se retrouve six mois plus tard sans personne pour l'expliquer.
 */

import { createInterface } from 'node:readline/promises';

import { cert, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  FieldValue,
  getFirestore,
  type CollectionReference,
  type Firestore,
  type Timestamp,
} from 'firebase-admin/firestore';

const PERIMETRES = [
  'progression',
  'seances',
  'statistiques',
  'synchros',
  'orphelins',
  'references',
] as const;
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

/**
 * L'application Admin, initialisée une fois.
 *
 * Firestore et Authentication la partagent : le périmètre `orphelins` a besoin
 * des deux, et deux `initializeApp` sur le même projet lèvent.
 */
let applicationAdmin: App | undefined;

function application(): App {
  if (applicationAdmin) return applicationAdmin;

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

  applicationAdmin = initializeApp({
    credential: cert({
      projectId: projet,
      clientEmail,
      privateKey: clePrivee.replace(/\\n/g, '\n'),
    }),
    projectId: projet,
  });

  return applicationAdmin;
}

function base(): Firestore {
  return getFirestore(application());
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

/**
 * Les documents `users/{uid}` dont le compte Authentication n'existe plus.
 *
 * **C'est exactement ce qu'un nettoyage doit savoir trouver, et il ne le
 * trouvait pas.** `planProgression` saute tout document sans sous-document ni
 * étoile : une coquille vide laissée par un compte supprimé traversait donc
 * tous les périmètres sans jamais être vue. Trente-six d'entre elles ont été
 * découvertes en septembre 2026, dont trente-cinq venaient du harnais de
 * mesure du parcours commercial — chaque exécution créait un compte jetable,
 * supprimait le compte à la fin, et laissait son document derrière elle.
 *
 * **La garde qui porte tout le poids.** Un document est déclaré orphelin parce
 * qu'il *n'est pas* dans la liste des comptes. Une liste vide, tronquée ou
 * refusée ferait donc paraître la base entière orpheline — et ce périmètre
 * l'effacerait. Deux précautions, et elles ne se négocient pas : la pagination
 * va jusqu'au bout, et **une liste vide est une erreur, jamais un résultat**.
 */
async function comptesVivants(): Promise<Set<string>> {
  const auth = getAuth(application());
  const uids = new Set<string>();
  let page: string | undefined;

  do {
    const lot = await auth.listUsers(1000, page);
    for (const compte of lot.users) uids.add(compte.uid);
    page = lot.pageToken;
  } while (page);

  if (uids.size === 0) {
    throw new Error(
      'Aucun compte Authentication listé. Un document utilisateur est déclaré ' +
        'orphelin parce qu’il ne figure pas dans cette liste : la tenir pour vide ' +
        'reviendrait à déclarer toute la base orpheline. Rien n’a été tenté — ' +
        'vérifiez les droits du compte de service.',
    );
  }

  return uids;
}

/** Le document d'utilisateur et tout son sous-arbre, compte par compte. */
async function planOrphelins(db: Firestore): Promise<Plan> {
  const vivants = await comptesVivants();
  const chemins: string[] = [];
  const lignes: string[] = [];

  for (const utilisateur of await db.collection('users').listDocuments()) {
    if (vivants.has(utilisateur.id)) continue;

    const donnees = (await utilisateur.get()).data() ?? {};
    let contenu = 0;

    for (const sous of await utilisateur.listCollections()) {
      const enfants = await sous.listDocuments();
      contenu += enfants.length;
      chemins.push(...enfants.map((enfant) => enfant.path));
    }

    chemins.push(utilisateur.path);
    lignes.push(
      `  ${utilisateur.id}  ${String(donnees.email ?? '(sans adresse)').padEnd(30)} ` +
        `${String(contenu).padStart(4)} document(s)`,
    );
  }

  return { chemins, lignes };
}

/**
 * Les prix qui renvoient à une séance qui n'existe plus.
 *
 * **Ce contrôle signale, il ne supprime pas, et c'est délibéré.** Un prix est
 * un trophée : il porte son code de séance, son rang et sa date en dur, il
 * s'affiche parfaitement sans la séance, et l'effacer au passage d'un
 * nettoyage de séances reviendrait à retirer à un commercial quelque chose
 * qu'il a gagné. Mais une incohérence que rien ne signale se découvre six mois
 * plus tard, et plus personne ne sait alors d'où elle vient.
 *
 * **Deux états, et la différence compte.** Ce qui est *déjà* orphelin l'était
 * avant ce lancement — c'est un constat. Ce qui va *le devenir* est le fait de
 * cette exécution-ci, et l'affichage est la dernière occasion de s'en
 * apercevoir avant que ce soit vrai.
 */
/* ------------------------------------------------- references cassees */

/** « 1 question », « 3 questions » — le reste du script s'accommode de « (s) ». */
function accord(nombre: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${nombre} ${nombre > 1 ? pluriel : singulier}`;
}

/**
 * Une séance à recoudre : les identifiants qu'elle garde et qui ne mènent plus
 * à rien.
 */
type Recouture = {
  chemin: string;
  titre: string;
  statut: string;
  disparues: string[];
  avant: number;
  apres: number;
  indexAvant: number;
  indexApres: number;
};

type PlanReferences = Plan & {
  recoutures: Recouture[];
  /** Séances qu'on ne touche pas : les recoudre les viderait entièrement. */
  bloquees: string[];
  /** Séances jouées : leur liste est un compte rendu, pas un plan de travail. */
  histoire: string[];
};

/**
 * Les références qui ne mènent plus nulle part.
 *
 * **Le défaut que ça répare, et il s'est vu.** Supprimer une question ne touche
 * pas aux séances : leur `questionIds` garde l'identifiant. La séance arrive
 * dessus le jeudi et projette « Cette question n'est plus publiée » devant la
 * salle. Depuis le lot 18, le panneau de suppression prévient — mais il ne
 * répare pas ce qui est déjà cassé.
 *
 * Deux dégâts distincts, traités ensemble parce qu'ils ont la même cause :
 *
 *   - **Les séances** gardent des identifiants morts. On les retire, et on
 *     recale `indexCourant` : une séance de six questions arrêtée à la
 *     cinquième, réduite à cinq, pointerait au-delà de sa propre liste.
 *   - **`questionStats`** garde un agrégat par question effacée. Il ne casse
 *     rien — l'écran des statistiques joint sur la banque — mais il gonfle une
 *     collection que personne ne relira, et il fausse les comptes bruts.
 *
 * **Une séance n'est jamais vidée.** Si la recoudre ne laissait aucune
 * question, on ne la touche pas et on la nomme : une séance sans question est
 * un document que l'application ne sait pas afficher, et le choix entre la
 * supprimer et la recomposer appartient à Noémie, pas à un script.
 *
 * **Une séance terminée ou abandonnée n'est jamais recousue.** Noémie a vu
 * neuf questions passer ce jour-là : son historique doit le dire. Réécrire le
 * passé pour réparer le présent serait un mauvais échange — et le bilan, figé
 * dans `bilan/final`, contredirait de toute façon une liste raccourcie après
 * coup. Elles sont **listées quand même**, avec la mention qu'on n'y touche
 * pas : une séance absente de la sortie passerait pour une séance oubliée.
 */
async function planReferences(db: Firestore): Promise<PlanReferences> {
  const existantes = new Set(
    (await db.collection('questions').get()).docs.map((question) => question.id),
  );

  const recoutures: Recouture[] = [];
  const bloquees: string[] = [];
  const histoire: string[] = [];

  /** Les séances qui se joueront encore. Les autres sont un compte rendu. */
  const A_VENIR = new Set(['attente', 'encours', 'pause']);

  for (const seance of (await db.collection('sessions').get()).docs) {
    const donnees = seance.data();
    const ids: string[] = Array.isArray(donnees.questionIds) ? donnees.questionIds : [];
    const disparues = ids.filter((id) => !existantes.has(id));
    if (disparues.length === 0) continue;

    const restants = ids.filter((id) => existantes.has(id));
    const titre = tronquer(donnees.titre || seance.id, 34);
    const statut = String(donnees.statut ?? '?');

    if (!A_VENIR.has(statut)) {
      histoire.push(
        `    ${statut.padEnd(11)} ${titre.padEnd(36)} ` +
          `${accord(disparues.length, 'question disparue', 'questions disparues')} sur ${ids.length}`,
      );
      continue;
    }

    if (restants.length === 0) {
      bloquees.push(
        `  ${statut.padEnd(11)} ${titre} — ${accord(ids.length, 'question a disparu', 'questions ont disparu')}`,
      );
      continue;
    }

    const indexAvant = Number(donnees.indexCourant ?? 0);
    /* Le rang suit le retrait : on compte combien de disparues le précédaient,
       puis on borne au dernier rang qui existe encore. */
    const avancees = ids.slice(0, indexAvant).filter((id) => !existantes.has(id)).length;
    const indexApres = Math.min(Math.max(0, indexAvant - avancees), restants.length - 1);

    recoutures.push({
      chemin: `sessions/${seance.id}`,
      titre,
      statut,
      disparues,
      avant: ids.length,
      apres: restants.length,
      indexAvant,
      indexApres,
    });
  }

  const statsOrphelines = (await db.collection('questionStats').get()).docs
    .filter((agregat) => !existantes.has(agregat.id))
    .map((agregat) => `questionStats/${agregat.id}`);

  const lignes: string[] = [];

  if (recoutures.length > 0) {
    lignes.push('  Séances à recoudre :');
    for (const r of recoutures) {
      const rang = r.indexAvant === r.indexApres ? '' : `, rang ${r.indexAvant} → ${r.indexApres}`;
      lignes.push(
        `    ${r.statut.padEnd(11)} ${r.titre.padEnd(36)} ` +
          `${accord(r.disparues.length, 'retirée')}, ${r.avant} → ${accord(r.apres, 'question')}${rang}`,
      );
    }
  }

  if (bloquees.length > 0) {
    lignes.push(
      '  Séances à venir laissées telles quelles — les vider n’est pas une décision de script :',
    );
    lignes.push(...bloquees.map((ligne) => `  ${ligne}`));
  }

  if (histoire.length > 0) {
    lignes.push('  Séances déjà jouées — NON TOUCHÉES, leur liste est un compte rendu :');
    lignes.push(...histoire);
  }

  if (statsOrphelines.length > 0) {
    lignes.push(`  ${accord(statsOrphelines.length, 'agrégat')} questionStats sans question`);
  }

  return { chemins: statsOrphelines, lignes, recoutures, bloquees, histoire };
}

async function auditPrix(
  db: Firestore,
  aSupprimer: Set<string>,
): Promise<{ lignes: string[]; deja: number; aVenir: number }> {
  const existantes = new Set(
    (await db.collection('sessions').get()).docs.map((seance) => seance.id),
  );

  const lignes: string[] = [];
  let deja = 0;
  let aVenir = 0;

  for (const utilisateur of await db.collection('users').listDocuments()) {
    for (const trophee of (await utilisateur.collection('prix').get()).docs) {
      const code = String(trophee.data().codeSession ?? trophee.id);

      if (!existantes.has(trophee.id)) {
        deja += 1;
        lignes.push(`  ${code.padEnd(10)} séance absente de la base          ${utilisateur.id}`);
      } else if (aSupprimer.has(`sessions/${trophee.id}`)) {
        aVenir += 1;
        lignes.push(`  ${code.padEnd(10)} séance effacée par ce lancement    ${utilisateur.id}`);
      }
    }
  }

  return { lignes, deja, aVenir };
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

/**
 * Recoud les séances : retire les identifiants morts et recale le rang.
 *
 * Seuls ces deux champs bougent. Une mise à jour large réécrirait des champs
 * que ce script n'a pas lus, et les règles — qu'il contourne, puisqu'il passe
 * par le SDK Admin — ne l'arrêteraient pas.
 */
async function recoudre(db: Firestore, recoutures: Recouture[]): Promise<void> {
  for (let debut = 0; debut < recoutures.length; debut += ECRITURES_PAR_LOT) {
    const lot = db.batch();
    for (const recouture of recoutures.slice(debut, debut + ECRITURES_PAR_LOT)) {
      const seance = db.doc(recouture.chemin);
      lot.update(seance, {
        questionIds: FieldValue.arrayRemove(...recouture.disparues),
        indexCourant: recouture.indexApres,
      });
    }
    await lot.commit();
    console.log(`  ${Math.min(debut + ECRITURES_PAR_LOT, recoutures.length)} / ${recoutures.length}`);
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
  let recoutures: Recouture[] = [];

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

  if (actifs.includes('orphelins')) {
    const plan = await planOrphelins(db);
    console.log('ORPHELINS — documents users/ dont le compte Authentication n’existe plus');
    console.log(plan.lignes.length > 0 ? plan.lignes.join('\n') : '  (rien)');
    console.log();
    chemins.push(...plan.chemins);
  }

  if (actifs.includes('references')) {
    const plan = await planReferences(db);
    recoutures = plan.recoutures;
    console.log('RÉFÉRENCES CASSÉES — séances et statistiques qui pointent vers une question effacée');
    console.log(plan.lignes.length > 0 ? plan.lignes.join('\n') : '  (rien)');
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

  /*
   * Le contrôle de cohérence, avant le total et avant toute écriture.
   *
   * Il s'affiche même en essai à blanc, et même quand aucun périmètre ne le
   * concerne : c'est un constat sur la base, pas un périmètre de plus.
   */
  const prix = await auditPrix(db, new Set(chemins.filter((chemin) => /^sessions\/[^/]+$/.test(chemin))));

  if (prix.lignes.length > 0) {
    console.log('COHÉRENCE — prix renvoyant à une séance qui n’existe pas ou plus');
    console.log(prix.lignes.join('\n'));
    console.log(
      `  ${prix.deja} déjà orphelin(s), ${prix.aVenir} qui le deviendrai(en)t par ce lancement.` +
        (actifs.includes('progression')
          ? ' Le périmètre « progression » les efface de toute façon.'
          : ' Ils restent affichables : un prix porte son code, son rang et sa date.'),
    );
    console.log();
  }

  console.log(
    `TOTAL : ${chemins.length} document(s) à supprimer, ` +
      `${recoutures.length} séance(s) à recoudre, ` +
      `${remisesAZero.length} compte(s) à remettre à zéro.`,
  );

  if (chemins.length === 0 && recoutures.length === 0 && remisesAZero.length === 0) {
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

  if (recoutures.length > 0) {
    console.log(`\nRecouture de ${recoutures.length} séance(s) :`);
    await recoudre(db, recoutures);
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
