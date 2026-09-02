import { readFileSync } from 'node:fs';

import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import type { Firestore } from 'firebase/firestore';

export const PROJET = 'demo-medere-quiz';

/** Comptes utilisés par les scénarios. */
export const JORDAN = { uid: 'uid-jordan', email: 'jordan@medere.fr' };
export const SOPHIE = { uid: 'uid-sophie', email: 'sophie@medere.fr' };
export const NOEMIE = { uid: 'uid-noemie', email: 'noemie@medere.fr', admin: true };
export const EXTERNE = { uid: 'uid-externe', email: 'visiteur@gmail.com' };

/** Horodatage passé, accepté par les règles. */
export const HIER = new Date('2026-09-01T09:00:00Z');

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
    repondueLe: HIER,
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
    repondueLe: HIER,
    ...remplacements,
  };
}

/** Session collective conforme au modèle. */
export function session(remplacements: Document = {}): Document {
  return {
    code: 'JEUDI7',
    questionIds: ['q-vf', 'q-qcm'],
    indexCourant: 0,
    revelee: false,
    statut: 'encours',
    animateurUid: NOEMIE.uid,
    creeeLe: HIER,
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
    ...remplacements,
  };
}
