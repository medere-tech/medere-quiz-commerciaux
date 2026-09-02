import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { demarrerAppCheck } from '@/lib/firebase/app-check';
import { envPubliques } from '@/lib/env/publiques';
import { DOMAINE_DES_REGLES } from '@/lib/auth/domaine';

const NOM_APPLICATION = 'medere-quiz';

export function applicationFirebase(): FirebaseApp {
  const existante = getApps().find((app) => app.name === NOM_APPLICATION);
  if (existante) {
    const application = getApp(NOM_APPLICATION);
    demarrerAppCheck(application);
    return application;
  }

  const application = initializeApp(
    {
      apiKey: envPubliques.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: envPubliques.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: envPubliques.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: envPubliques.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: envPubliques.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: envPubliques.NEXT_PUBLIC_FIREBASE_APP_ID,
    },
    NOM_APPLICATION,
  );

  // Avant tout accès à Firestore ou à l'authentification : le jeton
  // d'attestation doit accompagner les requêtes dès la première.
  demarrerAppCheck(application);

  return application;
}

export function authentification(): Auth {
  return getAuth(applicationFirebase());
}

export function baseDeDonnees(): Firestore {
  return getFirestore(applicationFirebase());
}

/**
 * Fournisseur Google. Le paramètre `hd` n'est qu'un filtre d'affichage sur
 * l'écran Google : il fait gagner du temps aux utilisateurs, il ne protège
 * rien. La restriction de domaine est vérifiée côté serveur et par les règles.
 */
export function fournisseurGoogle(): GoogleAuthProvider {
  const fournisseur = new GoogleAuthProvider();
  fournisseur.setCustomParameters({ hd: DOMAINE_DES_REGLES, prompt: 'select_account' });
  return fournisseur;
}
