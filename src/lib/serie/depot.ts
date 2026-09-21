'use client';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';

import { baseDeDonnees } from '@/lib/firebase/firestore';
/* Purs, donc partagés avec le rendu serveur : voir `serie/etats.ts`. */
export { etatsDesQuestions, type EtatComplet } from '@/lib/serie/etats';
import type { EtatComplet } from '@/lib/serie/etats';
import { enMillisecondes } from '@/lib/firebase/horodatage';
import { enQuestion, type Question } from '@/lib/questions/lecture';
import { STATUTS_SERVIS } from '@/lib/questions/modele';
import {
  apresUneSerie,
  assiduiteVide,
  clefDuJour,
  type Assiduite,
} from '@/lib/serie/assiduite';
import {
  avecNouvelles,
  paliersAtteints,
  type Mesures,
} from '@/lib/serie/recompenses';

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
  /**
   * La régularité : semaine en cours, série de jours d'affilée, record.
   *
   * Un champ du document de progression, et non une collection par jour — voir
   * `src/lib/serie/assiduite.ts` pour le raisonnement et la borne.
   */
  assiduite: Assiduite;
  /**
   * Les paliers franchis, et le jour où ils l'ont été.
   *
   * Une carte bornée par un ensemble fermé — la liste vit dans
   * `src/lib/serie/recompenses.ts`, jamais en base. Une clé inconnue du code
   * ne rend rien à l'écran.
   */
  recompenses: Record<string, string>;
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

  /* « À relire » sort aux commerciaux comme « publiée » : le statut dit qu'une
     question demande du travail, pas qu'elle doit disparaître. Voir
     `STATUTS_SERVIS`. */
  const instantane = await getDocs(
    query(collection(baseDeDonnees(), 'questions'), where('statut', 'in', [...STATUTS_SERVIS])),
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
          vueLeMs: enMillisecondes(donnees.majLe),
        },
      ];
    }),
  );
}

/**
 * L'état de chaque question tirable. Une question sans document d'état n'a
 * jamais été vue : c'est le poids le plus fort après un échec.
 */

export async function chargerProgression(uid: string): Promise<Progression> {
  const document = await getDoc(doc(baseDeDonnees(), 'users', uid));
  const donnees = document.data() ?? {};

  return {
    etoiles: typeof donnees.etoiles === 'number' ? donnees.etoiles : 0,
    seriesTerminees: typeof donnees.seriesTerminees === 'number' ? donnees.seriesTerminees : 0,
    assiduite: enAssiduite(donnees.assiduite),
    recompenses: enRecompenses(donnees.recompenses),
  };
}

/**
 * Relecture défensive de la carte des récompenses.
 *
 * Les comptes ouverts avant ce lot ne la portent pas, et une clé dont le code
 * ne connaît plus le palier est simplement ignorée à l'affichage — jamais une
 * cause d'erreur.
 */
function enRecompenses(brut: unknown): Record<string, string> {
  if (typeof brut !== 'object' || brut === null) return {};
  const carte: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(brut as Record<string, unknown>)) {
    if (typeof valeur === 'string') carte[cle] = valeur;
  }
  return carte;
}

/**
 * Relecture défensive du champ d'assiduité.
 *
 * Les comptes ouverts avant ce lot ne le portent pas, et la base est de la
 * recette : un champ absent ou d'une forme inattendue doit rendre une
 * assiduité vide, jamais faire tomber l'accueil.
 */
function enAssiduite(brut: unknown): Assiduite {
  if (typeof brut !== 'object' || brut === null) return assiduiteVide();
  const champs = brut as Record<string, unknown>;

  return {
    dernierJour: typeof champs.dernierJour === 'string' ? champs.dernierJour : '',
    serie: typeof champs.serie === 'number' ? champs.serie : 0,
    record: typeof champs.record === 'number' ? champs.record : 0,
    semaine: Array.isArray(champs.semaine)
      ? champs.semaine.filter((jour): jour is string => typeof jour === 'string')
      : [],
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
export async function crediterSerie(
  uid: string,
  etoiles: number,
  bilan: {
    /** Toutes les réponses justes : la récompense se constate ici, pas plus tard. */
    parfaite: boolean;
    /** Ce que l'écran mesure déjà — formations et mises en situation. */
    catalogue: Omit<Mesures, 'recordJours' | 'joursActifsCetteSemaine'>;
  },
  /*
   * Rend les récompenses **nouvellement** obtenues, pour que la fin de série
   * puisse les annoncer. Celles qu'on avait déjà n'en font pas partie : « vous
   * venez de gagner » ne se dit pas d'un palier franchi le mois dernier.
   */
): Promise<string[]> {
  const base = baseDeDonnees();
  const utilisateur = doc(base, 'users', uid);

  /*
   * **Une transaction, parce que l'assiduité se calcule depuis son état.**
   *
   * Les étoiles et le compte de séries s'incrémentent sans rien relire. La
   * série de jours, elle, dépend du `dernierJour` déjà en base : deux onglets
   * qui termineraient une série en même temps la compteraient deux fois si
   * chacun partait de la valeur qu'il avait chargée en ouvrant la page. La
   * lecture coûte une unité par série terminée — quelques-unes par jour pour
   * toute l'équipe.
   */
  let nouvelles: string[] = [];

  await runTransaction(base, async (transaction) => {
    const instantane = await transaction.get(utilisateur);
    const donnees = instantane.data();
    const jour = clefDuJour(new Date());

    /*
     * L'assiduité d'abord : le record et les jours actifs de la semaine en
     * dépendent, et **le jour du jour n'y est pas encore compté** au moment où
     * l'on entre dans la transaction. Juger « cinq jours actifs cette semaine »
     * sur l'assiduité d'avant accorderait le palier un jour trop tard.
     */
    const assiduite = apresUneSerie(enAssiduite(donnees?.assiduite), jour);

    const atteints = paliersAtteints({
      ...bilan.catalogue,
      recordJours: assiduite.record,
      joursActifsCetteSemaine: assiduite.semaine.length,
    });

    const avant = enRecompenses(donnees?.recompenses);
    const apres = avecNouvelles(
      avant,
      bilan.parfaite ? [...atteints, 'serie-parfaite'] : atteints,
      jour,
    );
    /* Une transaction peut être rejouée : la liste se recalcule à chaque
       passage plutôt que de s'accumuler. */
    nouvelles = Object.keys(apres).filter((id) => !avant[id]);

    transaction.update(utilisateur, {
      etoiles: increment(etoiles),
      seriesTerminees: increment(1),
      assiduite,
      recompenses: apres,
      vuLe: serverTimestamp(),
    });
  });

  return nouvelles;
}
