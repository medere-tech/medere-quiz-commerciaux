import 'server-only';

import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { envServeur } from '@/lib/env/serveur';

const NOM_APPLICATION = 'medere-quiz-admin';

function applicationAdmin(): App {
  const existante = getApps().find((app) => app.name === NOM_APPLICATION);
  if (existante) return getApp(NOM_APPLICATION);

  return initializeApp(
    {
      credential: cert({
        projectId: envServeur.projetId,
        clientEmail: envServeur.clientEmail,
        privateKey: envServeur.clePrivee,
      }),
      projectId: envServeur.projetId,
    },
    NOM_APPLICATION,
  );
}

export function authAdmin(): Auth {
  return getAuth(applicationAdmin());
}

export function firestoreAdmin(): Firestore {
  return getFirestore(applicationAdmin());
}
