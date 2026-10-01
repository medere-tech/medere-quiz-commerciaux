import { readFileSync } from 'node:fs';

import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, increment, serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore';

import { clefDuJour } from '@/lib/serie/assiduite';

export const PROJET = 'demo-medere-quiz';

/** Comptes utilisés par les scénarios. */
export const JORDAN = { uid: 'uid-jordan', email: 'jordan@medere.fr' };
export const SOPHIE = { uid: 'uid-sophie', email: 'sophie@medere.fr' };
export const NOEMIE = { uid: 'uid-noemie', email: 'noemie@medere.fr', admin: true };
export const EXTERNE = { uid: 'uid-externe', email: 'visiteur@gmail.com' };

/** Horodatage passé, accepté par les règles. */
export const HIER = new Date('2026-09-01T09:00:00Z');

/**
 * Un instant passé, mais distinct de `HIER` : de quoi vérifier qu'un champ a
 * bien changé. Une seconde en arrière plutôt qu'une date écrite en dur, qui
 * finirait par tomber dans le futur.
 */
export const MAINTENANT = new Date(Date.now() - 1000);

/** Horodatage futur, refusé par les règles. */
export function demain(): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

type Identite = {
  uid: string;
  email: string;
  admin?: boolean;
  emailVerifie?: boolean;
};

type Document = Record<string, unknown>;

export async function creerEnvironnement(): Promise<RulesTestEnvironment> {
  const [hote = '127.0.0.1', port = '8080'] = (
    process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
  ).split(':');

  return initializeTestEnvironment({
    projectId: PROJET,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: hote,
      port: Number(port),
    },
  });
}

/** Base vue par un utilisateur connecté, avec les claims de son jeton. */
export function connecte(env: RulesTestEnvironment, identite: Identite): Firestore {
  const jeton: Record<string, unknown> = {
    email: identite.email,
    email_verified: identite.emailVerifie ?? true,
  };
  if (identite.admin === true) jeton.admin = true;

  return env.authenticatedContext(identite.uid, jeton).firestore() as unknown as Firestore;
}

/** Base vue par un visiteur non authentifié. */
export function anonyme(env: RulesTestEnvironment): Firestore {
  return env.unauthenticatedContext().firestore() as unknown as Firestore;
}

/**
 * Question conforme au modèle. Les scénarios de refus partent de cette base
 * et n'en modifient qu'un champ : ce qui échoue est alors sans ambiguïté.
 */
export function question(remplacements: Document = {}): Document {
  return {
    type: 'vf',
    contexte: null,
    enonce: 'Le DPC est obligatoire pour les chirurgiens-dentistes.',
    options: { a: 'Vrai', b: 'Faux' },
    ordreOptions: ['a', 'b'],
    bonnesReponses: ['a'],
    explication: "L'obligation est triennale.",
    formationIds: ['formation-1'],
    theme: 'reglementaire',
    difficulte: 1,
    statut: 'publiee',
    sourceFiche: 'Fiche argumentaire Parodontie',
    sourceVersion: 'v3',
    creeeLe: HIER,
    modifieeLe: HIER,
    creeePar: NOEMIE.uid,
    ...remplacements,
  };
}

/** Réponse individuelle conforme au modèle, cohérente avec `question()`. */
export function reponse(remplacements: Document = {}): Document {
  return {
    questionId: 'q1',
    correcte: false,
    optionsChoisies: ['b'],
    origine: 'entrainement',
    // L'application écrit `serverTimestamp()`, et les règles l'exigent.
    repondueLe: serverTimestamp(),
    ...remplacements,
  };
}

/** Réponse donnée en session collective, conforme à `question()`. */
export function reponseSession(uid: string, remplacements: Document = {}): Document {
  return {
    uid,
    questionId: 'q1',
    optionsChoisies: ['b'],
    correcte: false,
    repondueLe: serverTimestamp(),
    ...remplacements,
  };
}

/** Session collective conforme au modèle. */
export function session(remplacements: Document = {}): Document {
  return {
    code: 'JEUDI7',
    // Ce que la séance annonce d'elle-même. Le titre est obligatoire ; la
    // description peut rester vide.
    titre: 'Objections sur les classes virtuelles',
    description: '',
    // Recopié depuis le compte de l'animatrice, par elle-même : personne
    // d'autre ne peut lire `users/{uid}`.
    animateurNom: 'Noémie',
    questionIds: ['q-vf', 'q-qcm'],
    indexCourant: 0,
    revelee: false,
    // La salle d'attente vit entre l'ouverture et la première question.
    demarree: true,
    // La porte de la salle. Une séance s'ouvre ouverte.
    verrouillee: false,
    statut: 'encours',
    animateurUid: NOEMIE.uid,
    creeeLe: HIER,
    // Posé au lancement, pas à la composition : une séance en attente vaut
    // `null`.
    ouverteLe: HIER,
    // Posés à la clôture par la Cloud Function du bilan.
    termineeLe: null,
    presentsFinal: 0,
    // Répartition de la question en cours, écrite à la révélation. Vide tant
    // que la bonne réponse n'est pas montrée.
    repartition: [],
    repondants: 0,
    // Zéro vaut « non déclaré » : aucun dénominateur inventé.
    effectifAttendu: 0,
    // Chronomètre : une échéance commune à tous les appareils, posée quand la
    // question est poussée. Zéro seconde veut dire « pas de chronomètre ».
    dureeQuestionSecondes: 45,
    questionOuverteLe: HIER,
    ...remplacements,
  };
}

/** Marqueur de présence à une séance, conforme au modèle. */
export function participant(remplacements: Document = {}): Document {
  return {
    nom: 'Jordan',
    avatar: 'turquoise',
    // En salle ou en visio : la séance est hybride.
    presence: 'salle',
    rejointLe: serverTimestamp(),
    ...remplacements,
  };
}

/** Un appel à la porte, conforme au modèle. */
export function appel(remplacements: Document = {}): Document {
  return {
    nom: 'Jordan',
    avatar: 'turquoise',
    demandeLe: serverTimestamp(),
    ...remplacements,
  };
}

/** Formation du référentiel, conforme au modèle. */
export function formation(remplacements: Document = {}): Document {
  return {
    airtableId: 'rec1234567890abcd',
    numeroActionDpc: '12345678901',
    nom: 'Parodontie clinique',
    cibles: ['Chirurgien dentiste'],
    format: 'E-Learning',
    modalite: 'Formation continue',
    blocsCertification: ['2'],
    dureeTotale: '7 heures',
    urlWebflow: 'https://www.medere.fr/formations/parodontie',
    actif: true,
    syncLe: HIER,
    ...remplacements,
  };
}

/** Chaîne de longueur exacte, pour éprouver les plafonds. */
export function texteDe(longueur: number): string {
  return 'a'.repeat(longueur);
}

/** Liste de `nombre` identifiants distincts, pour éprouver les plafonds. */
export function identifiants(nombre: number, prefixe = 'opt'): string[] {
  return Array.from({ length: nombre }, (_, index) => `${prefixe}${index}`);
}

/** Document utilisateur tel que le serveur le crée à la connexion. */
export function utilisateur(remplacements: Document = {}): Document {
  return {
    email: 'jordan@medere.fr',
    nom: 'Jordan',
    photoURL: '',
    role: 'commercial',
    etoiles: 4,
    seriesTerminees: 2,
    creeLe: HIER,
    vuLe: HIER,
    // Nom d'affichage au classement des séances collectives, et nulle part
    // ailleurs. Le nom réel par défaut.
    nomSession: 'Jordan',
    avatar: 'turquoise',
    ...remplacements,
  };
}

let numeroReponse = 0;

/**
 * **Une réponse s'écrit avec son état, dans un seul lot**, comme le fait
 * `enregistrerReponse` : les règles refusent l'une sans l'autre depuis le
 * 1er octobre 2026. L'état nomme la réponse (`derniereReponse`) et ses
 * compteurs suivent le verdict de la réponse.
 *
 * `etat` remplace des champs de l'état écrit, pour éprouver un mensonge : un
 * pas de trop, un verdict contraire, une autre réponse nommée.
 */
export function repondreAvecEtat(
  base: Firestore,
  uid: string,
  donnees: Document = reponse(),
  etat: Document = {},
): { id: string; ecriture: Promise<void> } {
  const questionId = String(donnees.questionId);
  const correcte = donnees.correcte === true;
  const id = `${questionId}_essai${(numeroReponse += 1)}`;
  const lot = writeBatch(base);

  lot.set(doc(base, `users/${uid}/reponses/${id}`), donnees);
  lot.set(
    doc(base, `users/${uid}/etats/${questionId}`),
    {
      reussies: increment(correcte ? 1 : 0),
      tentatives: increment(1),
      derniereRatee: !correcte,
      majLe: serverTimestamp(),
      derniereReponse: id,
      ...etat,
    },
    { merge: true },
  );

  return { id, ecriture: lot.commit() };
}

/** La réponse sur laquelle s'appuie un crédit de série dans les tests. */
export const REPONSE_RECENTE = 'q1_recente';

/**
 * Pose une réponse donnée « à l'instant », comme la dernière d'une série : le
 * crédit qui la nomme est alors accepté.
 */
export async function semerReponseRecente(
  env: RulesTestEnvironment,
  uid: string,
  id = REPONSE_RECENTE,
): Promise<void> {
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore() as unknown as Firestore;
    await writeBatch(base).set(doc(base, `users/${uid}/reponses/${id}`), reponse()).commit();
  });
}

/**
 * Le crédit d'une série, tel que `crediterSerie` l'écrit, sur un compte
 * `utilisateur()` (quatre étoiles, deux séries) sans assiduité : une série de
 * plus, trois étoiles, le premier jour d'assiduité — le jour de Paris, calculé
 * par la fonction même du navigateur —, et la réponse qui le justifie.
 */
export function credit(remplacements: Document = {}): Document {
  const jour = clefDuJour(new Date());
  return {
    etoiles: 7,
    seriesTerminees: 3,
    assiduite: { dernierJour: jour, serie: 1, record: 1, semaine: [jour] },
    serieCloseSur: REPONSE_RECENTE,
    creditLe: serverTimestamp(),
    vuLe: serverTimestamp(),
    ...remplacements,
  };
}
