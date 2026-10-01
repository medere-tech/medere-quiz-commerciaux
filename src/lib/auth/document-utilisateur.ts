// Chemin relatif avec extension, et non l'alias `@/` : le script de nettoyage
// importe ce module sous Node, qui ne connaît pas les alias.
import { AVATAR_PAR_DEFAUT } from '../session/avatar.ts';

/**
 * Le document `users/{uid}` d'un compte neuf, champ pour champ.
 *
 * **Pourquoi une fonction, et pourquoi ici.** Les règles exigent, à chaque
 * mise à jour du document, un avatar de la palette et un nom de séance valide.
 * La connexion ne les posait pas : un compte neuf ne pouvait donc enregistrer
 * **aucune** série — `PERMISSION_DENIED`, « Property avatar is undefined » —
 * tant qu'il n'avait pas rejoint une séance collective, seul endroit qui les
 * écrivait. Les tests ne l'ont jamais vu : leur fixture posait les deux champs
 * que la vraie connexion oubliait.
 *
 * Le document est donc construit ici, une fois, et la route de connexion, la
 * table rase du nettoyage et le test de régression l'emploient tous les trois.
 * Un champ exigé par les règles et oublié ici tombe dans le test, pas le
 * premier jour d'un commercial.
 *
 * Pur : les horodatages sont fournis par l'appelant — `serverTimestamp()` côté
 * SDK Admin, une date fixe côté test.
 */

/** Borne des règles (`nomAffichageValide`) : ce nom s'affiche sur un écran projeté. */
export const LONGUEUR_NOM_SESSION = 32;

/** Le nom réel, ramené à ce que les règles acceptent comme nom de séance. */
export function nomDeSessionParDefaut(nom: string): string {
  // Les règles refusent les caractères de contrôle et le vide.
  const propre = nom.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  return (propre || 'Commercial').slice(0, LONGUEUR_NOM_SESSION).trim();
}

export type IdentiteConnexion = {
  email: string;
  nom: string;
  photoURL: string;
  admin: boolean;
};

/** Ce que la connexion réécrit à chaque passage : l'identité, qui peut changer côté Google. */
export function champsDIdentite<H>(identite: IdentiteConnexion, maintenant: H) {
  return {
    email: identite.email,
    nom: identite.nom,
    photoURL: identite.photoURL,
    // Affichage seulement. L'autorisation passe exclusivement par le claim.
    role: identite.admin ? 'admin' : 'commercial',
    vuLe: maintenant,
  };
}

/**
 * Les champs sans lesquels les règles refusent toute mise à jour, avec leur
 * valeur par défaut. La connexion les pose sur un compte qui ne les a pas,
 * sans toucher à ceux qu'il a déjà choisis.
 */
export function champsExigesParDefaut(nom: string) {
  return {
    nomSession: nomDeSessionParDefaut(nom),
    avatar: AVATAR_PAR_DEFAUT,
  };
}

/** Le document complet d'un compte qui n'a encore rien fait. */
export function documentUtilisateurNeuf<H>(identite: IdentiteConnexion, maintenant: H) {
  return {
    ...champsDIdentite(identite, maintenant),
    ...champsExigesParDefaut(identite.nom),
    etoiles: 0,
    seriesTerminees: 0,
    creeLe: maintenant,
  };
}
