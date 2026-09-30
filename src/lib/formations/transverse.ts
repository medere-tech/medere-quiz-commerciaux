/**
 * La formation transverse : « DPC et réglementation ».
 *
 * **Ce n'est pas une formation, et le champ `transverse` le dit.** Certaines
 * questions ne relèvent d'aucune formation du catalogue — l'obligation
 * triennale, le forfait ANDPC, le RPPS — et sont pourtant utiles à tous les
 * commerciaux. Plutôt que de rendre `formationIds` facultatif, ce qui aurait
 * obligé chaque écran qui en dépend à décider quoi faire d'une question sans
 * formation, elles se rattachent à ce document réservé. Tout ce qui repose sur
 * `formationIds` continue de fonctionner, et l'avancement gagne une ligne
 * « DPC et réglementation » : un commercial qui ne maîtrise pas les règles du
 * DPC a un trou, et c'est la seule façon de le montrer.
 *
 * **Il ne vient pas d'Airtable**, qui reste en lecture seule. Il est créé par
 * `npm run formations:transverse`, qui le réécrit à l'identique autant de fois
 * qu'on le lance. Son identifiant n'a pas la forme `rec…` d'Airtable : aucune
 * écriture de la synchronisation ne peut l'atteindre. Reste la désactivation
 * de ce qui a disparu d'Airtable, dont il est exempté — voir
 * `formationsADesactiver`.
 *
 * Ce fichier n'importe rien, comme `chemins.ts` : le serveur et le navigateur
 * le lisent tous les deux.
 */

export const ID_FORMATION_TRANSVERSE = 'transverse-dpc';

export const NOM_FORMATION_TRANSVERSE = 'DPC et réglementation';

/**
 * Ce qui s'affiche à la place du public. Sa liste de publics est vide, et
 * « Public non précisé » laisserait croire à un oubli de saisie dans Airtable.
 */
export const PUBLIC_FORMATION_TRANSVERSE = 'Commune à tous les publics';

/** À la place du numéro d'action DPC, qu'elle n'a pas : elle ne se vend pas. */
export const ORIGINE_FORMATION_TRANSVERSE = 'Transverse, hors catalogue Airtable';

/**
 * La formation qu'un écran montre quand il n'en montre qu'une.
 *
 * Une question mixte — une vraie formation et la transverse — se range sous
 * la formation vendue : c'est elle que le commercial a en tête. La
 * transverse n'est retenue que lorsqu'elle est seule.
 *
 * **Une règle, pas une convention d'ordre.** Ranger la vraie formation en
 * premier à l'enregistrement aurait tenu jusqu'au jour où quelqu'un modifie
 * une question sans le savoir. Tout écran qui ne regarde qu'une formation
 * passe donc par ici, jamais par `formationIds[0]`.
 */
export function formationPrincipale(formationIds: readonly string[]): string | undefined {
  return formationIds.find((id) => id !== ID_FORMATION_TRANSVERSE) ?? formationIds[0];
}

/** Un document de `formations` est-il la formation transverse ? */
export function estFormationTransverse(
  identifiant: string,
  donnees: { transverse?: unknown } = {},
): boolean {
  return identifiant === ID_FORMATION_TRANSVERSE || donnees.transverse === true;
}
