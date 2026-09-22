import type { EtatQuestion } from '@/lib/serie/tirage';

/**
 * L'état d'une question pour une personne, et sa complétion.
 *
 * **Ce module est pur, et c'est la raison de son existence.** Il vivait dans
 * `serie/depot.ts`, qui porte `'use client'` parce qu'il parle au SDK Firestore
 * du navigateur. Le rendu serveur, qui lit désormais ces mêmes états, ne peut
 * pas appeler une fonction d'un module client — Next le refuse, et il a raison.
 * Le type et la complétion n'ont jamais eu besoin du SDK : les voici à part,
 * utilisables des deux côtés.
 */
export type EtatComplet = EtatQuestion & {
  /** Toutes tentatives confondues. `tentatives - reussies` donne les échecs. */
  tentatives: number;
  /**
   * Dernière fois que cette question a été vue. `null` si jamais.
   *
   * **Ce champ existait déjà et n'a rien coûté à obtenir.** `majLe` est écrit
   * à chaque réponse, borné par les règles, sur un document qui existe déjà et
   * qu'on relit déjà en entier. Aucune collection par jour, aucune lecture de
   * plus : il n'était simplement pas remonté.
   */
  vueLeMs: number | null;
};

/**
 * L'état de chaque question tirable. Une question sans document d'état n'a
 * jamais été vue : c'est le poids le plus fort après un échec, et **son
 * absence est l'information**.
 */
export function etatsDesQuestions(
  identifiants: string[],
  etats: Map<string, EtatComplet>,
): EtatComplet[] {
  return identifiants.map(
    (id) =>
      etats.get(id) ?? {
        id,
        reussies: 0,
        tentatives: 0,
        derniereRatee: false,
        dejaVue: false,
        vueLeMs: null,
      },
  );
}
