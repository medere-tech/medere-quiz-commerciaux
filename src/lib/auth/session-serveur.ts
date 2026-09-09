import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';

import { authAdmin } from '@/lib/firebase/admin';
import {
  estIdentifiantSansValeur,
  ErreurVerificationIdentite,
} from '@/lib/auth/identifiant-invalide';
import { envServeur } from '@/lib/env/serveur';
import { estDuDomaine } from '@/lib/auth/domaine';

export const NOM_COOKIE_SESSION = 'session_medere';

/** Cinq jours : une semaine de travail, sans reconnexion quotidienne. */
export const DUREE_SESSION_MS = 5 * 24 * 60 * 60 * 1000;

export type Session = {
  uid: string;
  email: string;
  nom: string;
  admin: boolean;
};

/**
 * Lit et vérifie le cookie de session. Renvoie `null` si l'utilisateur n'est
 * pas connecté, si son jeton a été révoqué, ou s'il n'appartient plus au
 * domaine autorisé.
 *
 * **Lève en cas de panne.** Une défaillance du serveur — module introuvable,
 * clé de service refusée, réseau coupé — n'est pas une absence de session et
 * ne doit pas se déguiser en écran de connexion. Elle remonte, elle apparaît
 * dans les journaux, elle se répare. Voir `identifiant-invalide.ts`.
 *
 * **Mémoïsée par requête.** `verifySessionCookie(cookie, true)` demande à
 * Firebase si la session a été révoquée, ce qui coûte un aller-retour réseau
 * mesuré à 234 ms de médiane. Or le rendu d'une page appelle cette fonction
 * plusieurs fois — la disposition puis la page — et payait donc deux fois le
 * même contrôle, sur le même cookie, dans le même rendu. `cache` de React
 * déduplique pour la durée d'une requête : la vérification est identique, le
 * contrôle de révocation reste actif, il n'a simplement plus lieu deux fois.
 * Rien n'est conservé entre deux requêtes.
 */
export const lireSession = cache(async function lireSession(): Promise<Session | null> {
  const cookie = (await cookies()).get(NOM_COOKIE_SESSION)?.value;
  if (!cookie) return null;

  try {
    const jeton = await authAdmin().verifySessionCookie(cookie, true);
    const email = jeton.email;

    if (!estDuDomaine(email, envServeur.domaineAutorise)) return null;

    return {
      uid: jeton.uid,
      email: email as string,
      nom: typeof jeton.name === 'string' ? jeton.name : '',
      admin: jeton.admin === true,
    };
  } catch (probleme) {
    // Cookie expiré, révoqué ou falsifié : c'est une absence de session, un
    // état normal, et l'écran de connexion est la bonne réponse.
    if (estIdentifiantSansValeur(probleme)) return null;

    // Tout le reste est une panne. La renvoyer comme « pas connecté »
    // afficherait un écran de connexion parfaitement trompeur, sans rien dans
    // les journaux : c'est exactement ce qui a masqué le module manquant.
    console.error('Vérification du cookie de session impossible', probleme);
    throw new ErreurVerificationIdentite(probleme);
  }
});

/** Session obligatoire. Lève si l'utilisateur n'est pas connecté. */
export async function exigerSession(): Promise<Session> {
  const session = await lireSession();
  if (!session) {
    throw new ErreurAcces('Vous devez être connecté pour accéder à cette page.', 401);
  }
  return session;
}

/**
 * Rôle administrateur obligatoire. Le contrôle porte sur le custom claim,
 * jamais sur un champ Firestore.
 */
export async function exigerAdmin(): Promise<Session> {
  const session = await exigerSession();
  if (!session.admin) {
    throw new ErreurAcces("Cet espace est réservé à l'équipe pédagogique.", 403);
  }
  return session;
}

export class ErreurAcces extends Error {
  readonly statut: number;

  constructor(message: string, statut: number) {
    super(message);
    this.name = 'ErreurAcces';
    this.statut = statut;
  }
}
