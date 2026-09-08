'use client';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';

import { baseDeDonnees } from '@/lib/firebase/client';
import type {
  BrouillonQuestion,
  Difficulte,
  QuestionAEcrire,
  StatutQuestion,
  TypeQuestion,
} from '@/lib/questions/modele';

/**
 * Accès aux questions, depuis le navigateur.
 *
 * **Pourquoi le SDK client et non le SDK Admin.** Le back-office écrit par le
 * même chemin que n'importe quel client : les règles de sécurité s'appliquent
 * à chaque enregistrement de Noémie. Passer par une route serveur en SDK Admin
 * contournerait les règles, et la validation de forme ne tiendrait plus qu'à
 * notre code. Ici, elle tient aux deux.
 *
 * La banque est chargée en entier, puis filtrée dans le navigateur : la
 * recherche sur l'énoncé n'existe pas côté Firestore, et quelques centaines de
 * documents se trient sans peine. Au-delà de quelques milliers, il faudra
 * paginer et s'appuyer sur les index déclarés dans `firestore.indexes.json`.
 */

export type Question = BrouillonQuestion & {
  id: string;
  creeePar: string;
  modifieeLe: Date | null;
  creeeLe: Date | null;
};

function enDate(valeur: unknown): Date | null {
  if (valeur && typeof (valeur as Timestamp).toDate === 'function') {
    return (valeur as Timestamp).toDate();
  }
  return null;
}

function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur : '';
}

function listeDeTextes(valeur: unknown): string[] {
  return Array.isArray(valeur) ? valeur.filter((element): element is string => typeof element === 'string') : [];
}

/**
 * Un document Firestore vers le modèle. Exporté parce que le parcours
 * commercial lit les mêmes documents : deux convertisseurs pour une même
 * collection finiraient par diverger sur un champ.
 */
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

export async function chargerQuestions(): Promise<Question[]> {
  const instantane = await getDocs(
    query(collection(baseDeDonnees(), 'questions'), orderBy('modifieeLe', 'desc')),
  );
  return instantane.docs.map((document) => enQuestion(document.id, document.data()));
}

export async function chargerQuestion(identifiant: string): Promise<Question | null> {
  const document = await getDoc(doc(baseDeDonnees(), 'questions', identifiant));
  return document.exists() ? enQuestion(document.id, document.data()) : null;
}

export async function creerQuestion(
  question: QuestionAEcrire,
  auteur: string,
): Promise<string> {
  const reference = await addDoc(collection(baseDeDonnees(), 'questions'), {
    ...question,
    creeePar: auteur,
    creeeLe: serverTimestamp(),
    modifieeLe: serverTimestamp(),
  });
  return reference.id;
}

export async function enregistrerQuestion(
  identifiant: string,
  question: QuestionAEcrire,
): Promise<void> {
  // `sourceFiche` et `sourceVersion` sont facultatifs : quand ils sont vidés,
  // il faut les effacer du document, pas les laisser à leur ancienne valeur.
  await updateDoc(doc(baseDeDonnees(), 'questions', identifiant), {
    ...question,
    sourceFiche: question.sourceFiche ?? '',
    sourceVersion: question.sourceVersion ?? '',
    modifieeLe: serverTimestamp(),
  });
}

/**
 * Duplication : une copie en brouillon, jamais publiée d'emblée. L'énoncé est
 * marqué pour qu'on ne confonde pas l'original et la copie dans la liste.
 */
export async function dupliquerQuestion(
  question: Question,
  auteur: string,
): Promise<string> {
  const copie: QuestionAEcrire = {
    type: question.type,
    contexte: question.type === 'scenario' ? question.contexte : null,
    enonce: `${question.enonce} (copie)`.slice(0, 500),
    options: question.options,
    ordreOptions: question.ordreOptions,
    bonnesReponses: question.bonnesReponses,
    explication: question.explication,
    formationIds: question.formationIds,
    theme: question.theme,
    difficulte: question.difficulte,
    statut: 'brouillon',
  };

  if (question.sourceFiche) copie.sourceFiche = question.sourceFiche;
  if (question.sourceVersion) copie.sourceVersion = question.sourceVersion;

  return creerQuestion(copie, auteur);
}

export async function supprimerQuestion(identifiant: string): Promise<void> {
  await deleteDoc(doc(baseDeDonnees(), 'questions', identifiant));
}
