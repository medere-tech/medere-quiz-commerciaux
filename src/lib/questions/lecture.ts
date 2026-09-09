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
