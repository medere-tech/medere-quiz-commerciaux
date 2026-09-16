import type {
  BrouillonQuestion,
  Difficulte,
  StatutQuestion,
  TypeQuestion,
} from '@/lib/questions/modele';

/**
 * Un document Firestore vers le modèle des questions.
 *
 * **Ni client ni serveur.** Ce module ne porte pas de directive `'use client'`
 * et n'importe aucun SDK : il est appelé par le dépôt navigateur comme par la
 * lecture serveur du référentiel. Deux convertisseurs pour une même collection
 * finiraient par diverger sur un champ, et la divergence se verrait le jour où
 * un écran affiche autre chose qu'un autre.
 *
 * Les horodatages des deux SDK exposent le même `toDate()`, c'est ce que la
 * conversion utilise — elle n'a donc pas à savoir d'où vient le document.
 */

export type Question = BrouillonQuestion & {
  id: string;
  creeePar: string;
  modifieeLe: Date | null;
  creeeLe: Date | null;
};

/**
 * Ce qu'une liste affiche, et rien de plus.
 *
 * **Le contenu d'une question pèse les quatre cinquièmes du document.** Mesuré
 * sur une banque de taille réaliste : `options`, `explication` et `contexte`
 * font environ 65 % des octets, `enonce` et les métadonnées le reste. Or
 * presque aucun écran n'a besoin du contenu de **toutes** les questions — il
 * lui faut la liste pour compter, filtrer, classer, et le contenu des dix
 * qu'il montre.
 *
 * Servir la banque entière à chaque rendu tenait tant qu'elle comptait
 * quatorze questions publiées. À cent cinquante, puis au-delà, le commercial
 * en 4G paie à chaque chargement un catalogue qu'il ne lira pas.
 *
 * **`enonce` reste**, parce que les listes l'affichent : questions à revoir,
 * composition d'une séance, bilan d'une séance passée. Sans lui il faudrait
 * une seconde lecture pour afficher une liste, ce qui annulerait le gain.
 */
export type QuestionListee = Omit<
  Question,
  'options' | 'ordreOptions' | 'bonnesReponses' | 'explication' | 'contexte' | 'sourceFiche' | 'sourceVersion'
>;

/**
 * Les champs à demander à Firestore pour une liste.
 *
 * Passés à `select()`, ils évitent de transporter le contenu depuis la base
 * jusqu'au serveur — le gain ne s'arrête donc pas à la charge utile envoyée au
 * navigateur. La facture, elle, ne bouge pas : Firestore compte les documents
 * lus, pas les octets.
 */
export const CHAMPS_LISTE = [
  'type',
  'enonce',
  'formationIds',
  'theme',
  'difficulte',
  'statut',
  'creeePar',
  'creeeLe',
  'modifieeLe',
] as const;

type Horodatage = { toDate?: () => Date };

function enDate(valeur: unknown): Date | null {
  const horodatage = valeur as Horodatage | undefined;
  return typeof horodatage?.toDate === 'function' ? horodatage.toDate() : null;
}

function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur : '';
}

function listeDeTextes(valeur: unknown): string[] {
  return Array.isArray(valeur)
    ? valeur.filter((element): element is string => typeof element === 'string')
    : [];
}

export function enQuestion(identifiant: string, donnees: Record<string, unknown>): Question {
  const options = (donnees.options ?? {}) as Record<string, string>;

  return {
    id: identifiant,
    type: texte(donnees.type) as TypeQuestion,
    contexte: texte(donnees.contexte),
    enonce: texte(donnees.enonce),
    options,
    ordreOptions: listeDeTextes(donnees.ordreOptions),
    bonnesReponses: listeDeTextes(donnees.bonnesReponses),
    explication: texte(donnees.explication),
    formationIds: listeDeTextes(donnees.formationIds),
    theme: texte(donnees.theme),
    difficulte: (typeof donnees.difficulte === 'number' ? donnees.difficulte : 1) as Difficulte,
    statut: texte(donnees.statut) as StatutQuestion,
    sourceFiche: texte(donnees.sourceFiche),
    sourceVersion: texte(donnees.sourceVersion),
    creeePar: texte(donnees.creeePar),
    modifieeLe: enDate(donnees.modifieeLe),
    creeeLe: enDate(donnees.creeeLe),
  };
}

/** La même conversion, bornée aux champs d'une liste. */
export function enQuestionListee(
  identifiant: string,
  donnees: Record<string, unknown>,
): QuestionListee {
  return {
    id: identifiant,
    type: texte(donnees.type) as TypeQuestion,
    enonce: texte(donnees.enonce),
    formationIds: listeDeTextes(donnees.formationIds),
    theme: texte(donnees.theme),
    difficulte: (typeof donnees.difficulte === 'number' ? donnees.difficulte : 1) as Difficulte,
    statut: texte(donnees.statut) as StatutQuestion,
    creeePar: texte(donnees.creeePar),
    modifieeLe: enDate(donnees.modifieeLe),
    creeeLe: enDate(donnees.creeeLe),
  };
}
