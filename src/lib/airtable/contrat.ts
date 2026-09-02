/**
 * Contrat d'interface avec la table Formations d'Airtable.
 *
 * Référence : docs/airtable-formations.md, qui fait foi sur ce modèle.
 * Valeurs relevées dans le schéma de la base le 2 septembre 2026.
 *
 * **Tout l'accès se fait par identifiants de champs.** Un nom de champ se
 * renomme d'un clic dans Airtable ; l'identifiant `fld...` est immuable. Un
 * appel qui lit par nom casse en silence le jour d'un renommage, sans qu'aucun
 * test ne le détecte.
 */

export const CHAMPS = {
  numeroActionDpc: 'fldpQPNVftoz4y8Ws',
  nom: 'fldo62rbDD2trd7Jg',
  cibles: 'fld8TIxjDWBvTvTvX',
  format: 'fldhfMBFvr9PoB70E',
  modalite: 'fldZUclOnuicRTQe9',
  statutSource: 'fld3NuuufLPPf3LgZ',
  blocsCertification: 'fldSzpTM9bOG4pp66',
  dureeTotale: 'fldSNZuA8JL91b3wA',
  urlWebflow: 'fld9C15oF7RVDEVyO',
} as const;

/**
 * Statuts qui retirent la formation du catalogue.
 *
 * La sélection « Statut de la formation » n'offre que deux valeurs : « Active »
 * et « Suspendue ». La comparaison se fait en minuscules, pour survivre à une
 * correction de casse dans Airtable.
 *
 * Une valeur inconnue — un statut ajouté après ce relevé, ou une case vide —
 * laisse la formation active et remonte dans le compte rendu. C'est le sens de
 * docs/airtable-formations.md : la désactivation est déclenchée par un statut
 * qui dit explicitement que la formation n'est plus proposée. Dans le doute,
 * une formation reste visible plutôt que de disparaître sans que personne
 * ne l'ait demandé.
 */
export const STATUTS_INACTIFS: readonly string[] = ['suspendue'];

/** Statuts connus, pour distinguer l'inconnu du prévu dans le compte rendu. */
export const STATUTS_CONNUS: readonly string[] = ['active', 'suspendue'];

/**
 * Plafonds de longueur, miroir de ceux de `firestore.rules`.
 *
 * La synchronisation écrit avec le SDK Admin, qui n'est pas soumis aux règles.
 * Ces valeurs doivent donc être tenues à l'identique des deux côtés : voir
 * README, section 4, « Plafonds de longueur ».
 */
export const PLAFONDS = {
  airtableId: 64,
  numeroActionDpc: 60,
  nom: 200,
  format: 60,
  modalite: 60,
  dureeTotale: 60,
  urlWebflow: 500,
  ciblesCumul: 500,
  blocsCertificationCumul: 200,
} as const;

/** Enregistrement tel que l'API le renvoie avec `returnFieldsByFieldId=true`. */
export type EnregistrementAirtable = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

/** Formation telle qu'elle est écrite dans Firestore. */
export type Formation = {
  airtableId: string;
  numeroActionDpc: string;
  nom: string;
  cibles: string[];
  format: string;
  modalite: string;
  blocsCertification: string[];
  dureeTotale: string;
  urlWebflow: string;
  actif: boolean;
  syncLe: Date;
};
