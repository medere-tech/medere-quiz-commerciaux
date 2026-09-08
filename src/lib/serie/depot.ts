'use client';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';

import { baseDeDonnees } from '@/lib/firebase/client';
import { enQuestion, type Question } from '@/lib/questions/depot';
import type { EtatQuestion } from '@/lib/serie/tirage';

/**
 * Accès aux données du parcours commercial.
 *
 * **Les réponses appartiennent à leur auteur.** Elles vivent sous
 * `users/{uid}/reponses`, et les règles n'y accordent aucune exception
 * administrateur. Ce dépôt n'écrit donc jamais ailleurs que sous l'uid
 * courant, et ne lit jamais celui d'un autre : c'est la même contrainte des
 * deux côtés, applicative et réglementaire.
 *
 * **Le verdict est recalculé par les règles.** Ce que le client écrit dans
 * `correcte` est vérifié contre la question elle-même avant d'être accepté.
 * Un client modifié ne peut pas s'attribuer une réussite.
 */

export type Reponse = {
  questionId: string;
  correcte: boolean;
  optionsChoisies: string[];
  origine: 'entrainement' | 'session';
  repondueLe: Date | null;
};

export type Progression = {
  etoiles: number;
  seriesTerminees: number;
};

function enDate(valeur: unknown): Date | null {
  if (valeur && typeof (valeur as Timestamp).toDate === 'function') {
    return (valeur as Timestamp).toDate();
  }
  return null;
}

/**
 * Questions tirables : les publiées, et elles seules. Un brouillon n'entre
 * dans aucune série — c'est la promesse faite dans le back-office.
 */
export async function chargerQuestionsPubliees(): Promise<Question[]> {
  const instantane = await getDocs(
    query(collection(baseDeDonnees(), 'questions'), where('statut', '==', 'publiee')),
  );
  return instantane.docs.map((document) => enQuestion(document.id, document.data()));
}

export async function chargerMesReponses(uid: string): Promise<Reponse[]> {
  const instantane = await getDocs(collection(baseDeDonnees(), 'users', uid, 'reponses'));

  return instantane.docs.map((document) => {
    const donnees = document.data();
    return {
      questionId: typeof donnees.questionId === 'string' ? donnees.questionId : '',
      correcte: donnees.correcte === true,
      optionsChoisies: Array.isArray(donnees.optionsChoisies)
        ? (donnees.optionsChoisies as string[])
        : [],
      origine: donnees.origine === 'session' ? 'session' : 'entrainement',
      repondueLe: enDate(donnees.repondueLe),
    };
  });
}

export async function chargerProgression(uid: string): Promise<Progression> {
  const document = await getDoc(doc(baseDeDonnees(), 'users', uid));
  const donnees = document.data() ?? {};

  return {
    etoiles: typeof donnees.etoiles === 'number' ? donnees.etoiles : 0,
    seriesTerminees: typeof donnees.seriesTerminees === 'number' ? donnees.seriesTerminees : 0,
  };
}

/**
 * L'historique d'une question, tel que le tirage l'attend.
 *
 * Les réponses ne portent pas d'ordre garanti : on trie sur l'horodatage pour
 * savoir laquelle est la dernière. Une réponse sans horodatage — le cas d'un
 * instantané lu avant que le serveur ait posé l'heure — est traitée comme la
 * plus récente, ce qui est vrai : elle vient d'être écrite.
 */
export function historiques(identifiants: string[], reponses: Reponse[]): EtatQuestion[] {
  const parQuestion = new Map<string, Reponse[]>();

  for (const reponse of reponses) {
    const liste = parQuestion.get(reponse.questionId);
    if (liste) liste.push(reponse);
    else parQuestion.set(reponse.questionId, [reponse]);
  }

  return identifiants.map((id) => {
    const tentatives = (parQuestion.get(id) ?? []).sort(
      (a, b) => (a.repondueLe?.getTime() ?? Infinity) - (b.repondueLe?.getTime() ?? Infinity),
    );
    const derniere = tentatives[tentatives.length - 1];

    return {
      id,
      reussies: tentatives.filter((tentative) => tentative.correcte).length,
      derniereRatee: derniere ? !derniere.correcte : false,
      dejaVue: tentatives.length > 0,
    };
  });
}

/**
 * Une réponse par question et par tentative — l'identifiant porte l'horodatage
 * pour que deux passages sur la même question ne s'écrasent pas. L'historique
 * complet est ce qui alimente la pondération.
 */
export async function enregistrerReponse(
  uid: string,
  questionId: string,
  optionsChoisies: string[],
  correcte: boolean,
): Promise<void> {
  const identifiant = `${questionId}_${Date.now()}`;

  await setDoc(doc(baseDeDonnees(), 'users', uid, 'reponses', identifiant), {
    questionId,
    correcte,
    optionsChoisies,
    origine: 'entrainement',
    repondueLe: serverTimestamp(),
  });
}

/**
 * Crédit de fin de série. Appelé une seule fois, et seulement quand la série
 * est allée à son terme : une série abandonnée ne rapporte rien, alors que ses
 * réponses, elles, sont déjà enregistrées.
 */
export async function crediterSerie(uid: string, etoiles: number): Promise<void> {
  await updateDoc(doc(baseDeDonnees(), 'users', uid), {
    etoiles: increment(etoiles),
    seriesTerminees: increment(1),
    vuLe: serverTimestamp(),
  });
}
