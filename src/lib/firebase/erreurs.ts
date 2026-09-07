'use client';

import { FirebaseError } from 'firebase/app';

/**
 * Traduction d'un échec de lecture Firestore en message d'écran.
 *
 * **Pourquoi ce fichier existe.** Le 3 septembre 2026, tout le back-office
 * était inutilisable : les règles publiées sur le projet étaient encore
 * celles du mode production — `allow read, write: if false` — alors que le
 * dépôt en portait trois cents lignes validées par 297 tests d'émulateur.
 * Le SDK Admin ignore les règles, donc les routes serveur répondaient 200 et
 * la synchronisation Airtable fonctionnait ; les tests d'émulateur portaient
 * sur le fichier du dépôt, pas sur le jeu de règles publié. Rien ne signalait
 * l'écart, et les trois écrans affichaient « le chargement a échoué » : la
 * description du symptôme, jamais celle de la cause.
 *
 * Un refus des règles n'est pas une panne passagère. Il ne se réessaie pas,
 * il se corrige sur le projet. L'écran doit le dire, et le bouton
 * « Réessayer » doit disparaître : le proposer, c'est envoyer Noémie cliquer
 * cent fois sur une porte fermée à clé.
 *
 * La distinction se joue sur le code d'erreur, jamais sur le message : les
 * libellés du SDK sont en anglais et changent de version en version.
 */

export type EchecDeLecture = {
  /** Message affiché, rédigé pour l'utilisatrice et non pour la console. */
  texte: string;
  /** Faux quand réessayer ne peut rien changer : le bouton est alors retiré. */
  reessayable: boolean;
};

function code(erreur: unknown): string {
  return erreur instanceof FirebaseError ? erreur.code : '';
}

/**
 * @param ceQuiEstLu Groupe nominal désignant la lecture qui a échoué, tel
 *   qu'il se lit dans une phrase : « la banque de questions », « le
 *   référentiel des formations ».
 */
export function echecDeLecture(erreur: unknown, ceQuiEstLu: string): EchecDeLecture {
  const identifiant = code(erreur);

  // La console porte le détail technique : l'écran, lui, s'adresse à
  // quelqu'un qui n'ouvrira pas les outils de développement.
  console.error(`Lecture Firestore refusée (${ceQuiEstLu}) : ${identifiant || erreur}`, erreur);

  if (identifiant === 'permission-denied') {
    return {
      texte:
        `Les règles de sécurité de la base refusent l'accès à ${ceQuiEstLu}. ` +
        `Votre connexion est valide et rien n'est perdu : c'est la configuration ` +
        `du projet Firebase qui doit être corrigée. Signalez-le à l'équipe ` +
        `technique, réessayer n'y changera rien.`,
      reessayable: false,
    };
  }

  if (identifiant === 'unauthenticated') {
    return {
      texte:
        `Votre session a expiré pendant la lecture de ${ceQuiEstLu}. ` +
        `Reconnectez-vous pour reprendre là où vous en étiez.`,
      reessayable: false,
    };
  }

  if (identifiant === 'unavailable' || identifiant === 'deadline-exceeded') {
    return {
      texte:
        `La base n'a pas répondu pendant la lecture de ${ceQuiEstLu}. ` +
        `La connexion est peut-être coupée. Réessayez dans un instant.`,
      reessayable: true,
    };
  }

  return {
    texte: `Impossible de lire ${ceQuiEstLu}. Réessayez dans un instant.`,
    reessayable: true,
  };
}
