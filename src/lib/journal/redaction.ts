/**
 * Ce qu'on retire d'une panne avant de l'écrire dans un journal.
 *
 * **C'est la garantie de confidentialité du signalement, et elle est
 * vérifiable.** Un message d'erreur n'est pas un texte neutre : il cite
 * volontiers ce qui l'a provoqué — un chemin Firestore qui porte un uid, une
 * adresse professionnelle, le début d'un énoncé. Remonter ces messages tels
 * quels reviendrait à construire, par accident, le journal nominatif que tout
 * le reste du projet s'interdit.
 *
 * **Ce module est pur, et il tourne deux fois.** Une fois dans le navigateur,
 * pour que ce qui part du poste soit déjà propre ; une fois sur le serveur,
 * parce qu'un client ne se croit pas sur parole. Les tests portent dessus.
 *
 * **Ce qui n'est jamais envoyé, et c'est le plus important.** Aucune valeur de
 * formulaire, aucun contenu du document, aucun corps de requête, aucune trace
 * de navigation, aucune capture. C'est exactement ce qu'un outil de suivi
 * générique collecte par défaut, et c'est pourquoi il n'y en a pas ici.
 */

/** Au-delà, un message ne renseigne plus, il recopie. */
export const MESSAGE_MAX = 300;

/** Six lignes de pile suffisent à situer une panne. */
export const LIGNES_DE_PILE_MAX = 6;

export const PILE_MAX = 1200;

export const ORIGINES = ['frontiere', 'globale', 'promesse', 'ressource'] as const;
export type Origine = (typeof ORIGINES)[number];

const ADRESSE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/**
 * Les chemins Firestore qui portent un identifiant d'utilisateur.
 *
 * `users/{uid}` et ce qui suit : `users/abc/reponses/q1_123` devient
 * `users/[uid]/reponses/q1_123`. La question reste lisible — c'est elle qui
 * aide à reproduire —, la personne disparaît.
 */
const CHEMIN_UTILISATEUR = /(\busers\/)[A-Za-z0-9_-]{6,}/g;

/** Un jeton porteur laissé dans un message d'erreur. */
const JETON = /\b(ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g;

export function expurger(texte: string): string {
  return texte
    .replace(ADRESSE, '[adresse]')
    .replace(CHEMIN_UTILISATEUR, '$1[uid]')
    .replace(JETON, '[jeton]');
}

function borner(texte: string, maximum: number): string {
  return texte.length > maximum ? `${texte.slice(0, maximum - 1)}…` : texte;
}

/**
 * Le chemin de l'écran, sans sa chaîne de requête.
 *
 * **La requête est retirée, pas raccourcie.** `?question=abc` ou `?code=JEUDI7`
 * n'aident pas à reproduire une panne, et rien ne garantit ce qu'un lien
 * futur y mettra. La règle du projet est qu'aucune donnée personnelle ne passe
 * par une chaîne de requête ; on ne va pas la réintroduire par le journal.
 */
export function cheminSeul(valeur: string): string {
  const sansRequete = valeur.split('?')[0]?.split('#')[0] ?? '';
  return borner(sansRequete, 120);
}

export type PanneSignalee = {
  origine: Origine;
  message: string;
  pile: string;
  chemin: string;
  /** Identifiant produit par Next, qui relie la panne aux journaux serveur. */
  digest: string;
};

/**
 * Met une panne en forme pour le journal : expurgée, bornée, sans surprise.
 *
 * Rend `null` quand il ne reste rien d'exploitable — un signalement vide
 * encombrerait le journal sans rien apprendre, et c'est ce journal qu'on
 * essaie de garder lisible.
 */
export function preparerPanne(brut: {
  origine?: unknown;
  message?: unknown;
  pile?: unknown;
  chemin?: unknown;
  digest?: unknown;
}): PanneSignalee | null {
  const origine = ORIGINES.find((candidate) => candidate === brut.origine);
  if (!origine) return null;

  const message = borner(expurger(String(brut.message ?? '').trim()), MESSAGE_MAX);
  if (message === '') return null;

  const pile = borner(
    expurger(String(brut.pile ?? ''))
      .split('\n')
      .slice(0, LIGNES_DE_PILE_MAX)
      .map((ligne) => ligne.trim())
      .join(' | '),
    PILE_MAX,
  );

  return {
    origine,
    message,
    pile,
    chemin: cheminSeul(String(brut.chemin ?? '')),
    digest: borner(String(brut.digest ?? '').replace(/[^\w-]/g, ''), 40),
  };
}
