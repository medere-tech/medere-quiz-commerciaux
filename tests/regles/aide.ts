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

type Identite = {
  uid: string;
  email: string;
  admin?: boolean;
  emailVerifie?: boolean;
};

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
