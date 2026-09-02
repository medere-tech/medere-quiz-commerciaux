'use client';

import { signInWithPopup, signOut, type User } from 'firebase/auth';

import { authentification, fournisseurGoogle } from '@/lib/firebase/client';

export class ErreurConnexion extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurConnexion';
  }
}

/**
 * Connexion Google puis ouverture de la session serveur.
 *
 * Rien n'est conservé dans le navigateur en dehors du cookie de session posé
 * par le serveur : ni localStorage, ni sessionStorage.
 */
export async function seConnecter(): Promise<User> {
  const auth = authentification();

  const resultat = await signInWithPopup(auth, fournisseurGoogle()).catch(() => {
    throw new ErreurConnexion(
      "La fenêtre Google s'est fermée avant la fin de la connexion. Réessayez.",
    );
  });

  try {
    await ouvrirSessionServeur(resultat.user);
  } catch (erreur) {
    // Session serveur refusée : on ne laisse pas un utilisateur connecté
    // côté navigateur mais rejeté côté serveur.
    await signOut(auth);
    throw erreur;
  }

  return resultat.user;
}

/**
 * Échange le jeton d'identité contre un cookie de session.
 *
 * Une seconde tentative est prévue : quand le serveur vient de poser ou de
 * retirer le custom claim administrateur, le jeton courant est périmé et doit
 * être renouvelé de force.
 */
async function ouvrirSessionServeur(utilisateur: User): Promise<void> {
  for (const forcerRenouvellement of [false, true]) {
    const idToken = await utilisateur.getIdToken(forcerRenouvellement);

    const reponse = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });

    if (reponse.ok) return;

    const corps = (await reponse.json().catch(() => ({}))) as {
      erreur?: string;
      rafraichirJeton?: boolean;
    };

    if (corps.rafraichirJeton === true && !forcerRenouvellement) continue;

    throw new ErreurConnexion(
      corps.erreur ?? "La session n'a pas pu être ouverte. Réessayez dans un instant.",
    );
  }

  throw new ErreurConnexion(
    "Vos droits viennent de changer. Reconnectez-vous pour qu'ils prennent effet.",
  );
}

/** Déconnexion : cookie serveur détruit, puis état local vidé. */
export async function seDeconnecter(): Promise<void> {
  await fetch('/api/auth/session', { method: 'DELETE' });
  await signOut(authentification());
}
