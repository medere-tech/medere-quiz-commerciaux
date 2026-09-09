'use client';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { baseDeDonnees } from '@/lib/firebase/firestore';
import { enQuestion, type Question } from '@/lib/questions/lecture';
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
 *
 * **Pourquoi un état par question, en plus des réponses.** Le tirage et la
 * maîtrise ne s'intéressent qu'à trois chiffres par question : combien de
 * réussites, la dernière tentative est-elle un échec, la question a-t-elle
 * été vue. Les recalculer imposait de relire tout l'historique — dix réponses
 * par jour sur deux ans font des milliers de documents rapatriés à chaque
 * ouverture, alors que le résultat tient en une ligne par question.
 * `users/{uid}/etats/{questionId}` porte ces trois chiffres, tenus à jour à
 * chaque réponse. Le volume est borné par la banque, plus par l'activité.
 *
 * Les réponses restent écrites : elles sont la source de vérité, ce que la
 * Cloud Function agrège, et ce qui permet de reconstruire les états si
 * l'agrégat dérive (`npm run etats:reprise`).
 *
 * **Le navigateur ne les relit plus, et c'est délibéré.** Le seul chemin de
 * lecture de l'historique complet passe désormais par les scripts
 * d'administration — `scripts/reconstruire-etats.ts` et
 * `scripts/agreger-historique.ts` — qui utilisent le SDK Admin. Garder ici un
 * lecteur exporté sans appelant inviterait à refaire la lecture qu'on vient
 * justement de retirer : à dix réponses par jour sur deux ans, elle rapatrie
 * cinq mille documents pour trois chiffres par question.
 */

export type Progression = {
  etoiles: number;
  seriesTerminees: number;
};

/**
 * Durée de vie du cache des questions publiées. Cinq minutes : assez pour
 * qu'un accueil suivi d'une série ne paie qu'une lecture, assez peu pour
 * qu'une question publiée par Noémie entre dans les séries du jour même.
 */
const FRAICHEUR_MS = 5 * 60 * 1000;

let cache: { questions: Question[]; lues: number } | null = null;

/**
 * Questions tirables : les publiées, et elles seules. Un brouillon n'entre
 * dans aucune série — c'est la promesse faite dans le back-office.
 *
 * **Pourquoi la lecture reste complète.** La pondération du README attribue un
 * poids à *chaque* question publiée avant d'en tirer dix sans remise : il faut
 * donc la liste entière. Le SDK navigateur ne sait pas projeter sur les seuls
 * identifiants — `select()` n'existe que côté Admin — si bien que lire trois
 * cents identifiants coûte trois cents documents. Aucun filtre serveur ne
 * réduit cela sans changer l'algorithme.
 *
 * **Ce qu'on évite quand même.** L'accueil et l'écran de série faisaient la
 * même lecture à quelques secondes d'intervalle : deux fois la banque par
 * série lancée. Le cache la ramène à une. Il vit en mémoire, le temps de
 * l'onglet — ni `localStorage` ni `sessionStorage`, interdits ici.
 */
export async function chargerQuestionsPubliees(): Promise<Question[]> {
  if (cache && Date.now() - cache.lues < FRAICHEUR_MS) return cache.questions;

  const instantane = await getDocs(
    query(collection(baseDeDonnees(), 'questions'), where('statut', '==', 'publiee')),
  );
  const questions = instantane.docs.map((document) => enQuestion(document.id, document.data()));

  cache = { questions, lues: Date.now() };
  return questions;
}

/** Vide le cache. Les tests s'en servent ; l'application n'en a pas besoin. */
export function oublierQuestionsPubliees(): void {
  cache = null;
}

/**
 * États par question, la lecture que fait le parcours.
 *
 * Un document par question déjà rencontrée : le nombre de documents suit la
 * taille de la banque, pas le nombre de réponses. Les questions jamais vues
 * n'ont pas d'état — leur absence *est* l'information, et `etatsDesQuestions`
 * les complète avec un état neuf.
 */
export type EtatComplet = EtatQuestion & {
  /** Toutes tentatives confondues. `tentatives - reussies` donne les échecs. */
  tentatives: number;
};

export async function chargerMesEtats(uid: string): Promise<Map<string, EtatComplet>> {
  const instantane = await getDocs(collection(baseDeDonnees(), 'users', uid, 'etats'));

  return new Map(
    instantane.docs.map((document) => {
      const donnees = document.data();
      const reussies = typeof donnees.reussies === 'number' ? donnees.reussies : 0;
      const tentatives = typeof donnees.tentatives === 'number' ? donnees.tentatives : 0;

      return [
        document.id,
        {
          id: document.id,
          reussies,
          tentatives,
          derniereRatee: donnees.derniereRatee === true,
          dejaVue: tentatives > 0,
        },
      ];
    }),
  );
}

/**
 * L'état de chaque question tirable. Une question sans document d'état n'a
 * jamais été vue : c'est le poids le plus fort après un échec.
 */
export function etatsDesQuestions(
  identifiants: string[],
  etats: Map<string, EtatComplet>,
): EtatComplet[] {
  return identifiants.map(
    (id) =>
      etats.get(id) ?? { id, reussies: 0, tentatives: 0, derniereRatee: false, dejaVue: false },
  );
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
  const base = baseDeDonnees();

  /*
   * La réponse et l'état partent dans le même lot : ou les deux sont écrits,
   * ou aucun. Un état avancé sans sa réponse fausserait la reprise, et une
   * réponse sans son état ferait rejouer une question déjà traitée.
   *
   * `derniereRatee` s'écrase à chaque tentative — c'est bien la *dernière* qui
   * compte, pas le cumul. `reussies` et `tentatives` s'incrémentent, ce que
   * les règles vérifient : un compteur ne peut que monter, d'un pas à la fois.
   */
  const lot = writeBatch(base);

  lot.set(doc(base, 'users', uid, 'reponses', identifiant), {
    questionId,
    correcte,
    optionsChoisies,
    origine: 'entrainement',
    repondueLe: serverTimestamp(),
  });

  lot.set(
    doc(base, 'users', uid, 'etats', questionId),
    {
      reussies: increment(correcte ? 1 : 0),
      tentatives: increment(1),
      derniereRatee: !correcte,
      majLe: serverTimestamp(),
    },
    { merge: true },
  );

  await lot.commit();
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
