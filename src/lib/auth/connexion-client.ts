'use client';

import { signInWithPopup, signOut, type User } from 'firebase/auth';

import { authentification, fournisseurGoogle } from '@/lib/firebase/client';
import { messageDeFenetre } from '@/lib/auth/messages-connexion';

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

  const resultat = await signInWithPopup(auth, fournisseurGoogle()).catch((erreur: unknown) => {
    throw new ErreurConnexion(messageDeFenetre(erreur));
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
export async function ouvrirSessionServeur(utilisateur: User): Promise<void> {
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

/**
 * Refait le cookie de session sans rien demander à personne.
 *
 * **Pourquoi c'est le navigateur qui agit.** Un cookie de session Firebase ne
 * se prolonge pas côté serveur : il se refabrique à partir d'un jeton
 * d'identité frais, que seul le navigateur peut produire — il détient le jeton
 * de rafraîchissement. Le serveur dit quand (`renouvellementConseille`), le
 * navigateur le fait.
 *
 * **Un échec ne se voit pas, et c'est voulu.** Le cookie en place est encore
 * valable — on renouvelle à mi-vie, pas à l'expiration. Interrompre quelqu'un
 * pour lui dire qu'un renouvellement anticipé a échoué serait du bruit ; la
 * prochaine visite réessaiera. Seul le journal en garde trace.
 *
 * Le renouvellement réutilise le chemin d'ouverture, donc il repose aussi le
 * custom claim si le rôle a changé entre-temps : un administrateur promu voit
 * ses droits prendre effet à sa visite suivante, sans reconnexion.
 */
export async function renouvelerSessionServeur(utilisateur: User): Promise<void> {
  try {
    await ouvrirSessionServeur(utilisateur);
  } catch (panne: unknown) {
    console.error('Renouvellement de la session impossible', panne);
  }
}
