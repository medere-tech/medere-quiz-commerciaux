'use client';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,

} from 'firebase/firestore';

import { baseDeDonnees } from '@/lib/firebase/firestore';
import { enQuestion, type Question } from '@/lib/questions/lecture';
import { normaliserEnonce } from '@/lib/texte';
import type { QuestionAEcrire, StatutQuestion, TypeQuestion } from '@/lib/questions/modele';

export type { Question } from '@/lib/questions/lecture';

/**
 * Accès aux questions, depuis le navigateur.
 *
 * **Pourquoi le SDK client et non le SDK Admin.** Le back-office écrit par le
 * même chemin que n'importe quel client : les règles de sécurité s'appliquent
 * à chaque enregistrement de Noémie. Passer par une route serveur en SDK Admin
 * contournerait les règles, et la validation de forme ne tiendrait plus qu'à
 * notre code. Ici, elle tient aux deux.
 *
 * **Les filtres et le tri s'exécutent sur Firestore, pas dans le navigateur.**
 * Charger la banque entière à chaque ouverture était tenable à seize
 * questions ; à trois cents, chaque visite téléchargerait la base. Statut,
 * format, formation et tri partent donc dans la requête, et la liste se
 * pagine par curseur.
 *
 * **La recherche plein texte reste au navigateur.** Firestore ne sait pas
 * chercher dans un texte : ni sous-chaîne, ni insensibilité aux accents, ni
 * recherche sur plusieurs champs à la fois. C'est une limite du produit, pas
 * un choix d'implémentation. Elle s'applique donc à l'ensemble déjà réduit
 * par les filtres serveur — que `chargerToutesLesQuestions` rapatrie page par
 * page, sous un plafond.
 */

export async function chargerQuestions(): Promise<Question[]> {
  const instantane = await getDocs(
    query(collection(baseDeDonnees(), 'questions'), orderBy('modifieeLe', 'desc')),
  );
  return instantane.docs.map((document) => enQuestion(document.id, document.data()));
}

/** Ce que les filtres de la banque envoient à Firestore. Non renseigné vaut
 *  « tous », et retire simplement la contrainte de la requête. */
export type FiltresQuestions = {
  statut?: StatutQuestion;
  type?: TypeQuestion;
  formationId?: string;
};

export const TRIS_QUESTIONS = ['recentes', 'anciennes', 'alpha'] as const;
export type TriQuestions = (typeof TRIS_QUESTIONS)[number];

/**
 * Plafond de la recherche plein texte. Au-delà, on cesse de rapatrier : mieux
 * vaut demander un filtre de plus que télécharger la banque entière au premier
 * caractère tapé. L'écran le dit quand il l'atteint.
 */
export const PLAFOND_RECHERCHE = 1000;

export type PageQuestions = {
  questions: Question[];
  /** Dernier document lu, à repasser pour obtenir la suite. */
  curseur: QueryDocumentSnapshot | null;
  /** Faux dès qu'une page revient plus courte que demandée. */
  encore: boolean;
};

function contraintes(filtres: FiltresQuestions, tri: TriQuestions): QueryConstraint[] {
  const liste: QueryConstraint[] = [];

  if (filtres.statut) liste.push(where('statut', '==', filtres.statut));
  if (filtres.type) liste.push(where('type', '==', filtres.type));
  if (filtres.formationId) {
    liste.push(where('formationIds', 'array-contains', filtres.formationId));
  }

  if (tri === 'alpha') liste.push(orderBy('enonce'));
  else liste.push(orderBy('modifieeLe', tri === 'anciennes' ? 'asc' : 'desc'));

  return liste;
}

/** Une page de la banque, filtrée et triée par Firestore. */
export async function chargerPageQuestions(
  filtres: FiltresQuestions,
  tri: TriQuestions,
  taille: number,
  apres?: QueryDocumentSnapshot | null,
): Promise<PageQuestions> {
  const suite = apres ? [startAfter(apres)] : [];

  const instantane = await getDocs(
    query(
      collection(baseDeDonnees(), 'questions'),
      ...contraintes(filtres, tri),
      ...suite,
      limit(taille),
    ),
  );

  return {
    questions: instantane.docs.map((document) => enQuestion(document.id, document.data())),
    curseur: instantane.docs.at(-1) ?? null,
    encore: instantane.size === taille,
  };
}

/**
 * L'ensemble filtré, rapatrié page par page pour la recherche plein texte.
 * `atteintLePlafond` dit à l'écran qu'il ne cherche pas dans tout, plutôt que
 * de le laisser croire à un résultat complet.
 */
export async function chargerToutesLesQuestions(
  filtres: FiltresQuestions,
  tri: TriQuestions,
  plafond: number = PLAFOND_RECHERCHE,
): Promise<{ questions: Question[]; atteintLePlafond: boolean }> {
  const questions: Question[] = [];
  let curseur: QueryDocumentSnapshot | null = null;

  while (questions.length < plafond) {
    const page: PageQuestions = await chargerPageQuestions(
      filtres,
      tri,
      Math.min(200, plafond - questions.length),
      curseur,
    );

    questions.push(...page.questions);
    curseur = page.curseur;
    if (!page.encore) return { questions, atteintLePlafond: false };
  }

  return { questions, atteintLePlafond: true };
}

/**
 * Limite d'un filtre `in` chez Firestore : trente valeurs par requête.
 * https://firebase.google.com/docs/firestore/query-data/queries#in_not-in
 */
export const VALEURS_PAR_REQUETE_IN = 30;

/**
 * Parmi les énoncés proposés, ceux que la banque contient déjà.
 *
 * **Pourquoi une requête plutôt qu'une lecture complète.** La détection de
 * doublons comparait chaque ligne collée à la banque entière : soixante lignes
 * importées faisaient télécharger trois cents questions. Avec `enonce` indexé,
 * deux requêtes suffisent et ne ramènent que les doublons réels.
 *
 * **La comparaison reste normalisée.** Firestore ne sait comparer que des
 * chaînes exactes : la requête porte donc sur `enonceNormalise`, champ dérivé
 * écrit à chaque enregistrement. Casse, accents et ponctuation ne créent plus
 * de faux négatif — « Le DPC est-il obligatoire ? » et « le dpc est il
 * obligatoire » sont reconnus comme le même énoncé, comme dans le navigateur.
 *
 * Rend les formes normalisées trouvées, pas les énoncés d'origine : c'est sur
 * cette forme que l'appelant compare.
 */
export async function enoncesDejaEnBanque(enonces: string[]): Promise<Set<string>> {
  const distincts = [...new Set(enonces.map(normaliserEnonce).filter(Boolean))];
  const trouves = new Set<string>();

  for (let debut = 0; debut < distincts.length; debut += VALEURS_PAR_REQUETE_IN) {
    const lot = distincts.slice(debut, debut + VALEURS_PAR_REQUETE_IN);

    const instantane = await getDocs(
      query(collection(baseDeDonnees(), 'questions'), where('enonceNormalise', 'in', lot)),
    );

    for (const document of instantane.docs) {
      const normalise = document.data().enonceNormalise;
      if (typeof normalise === 'string') trouves.add(normalise);
    }
  }

  return trouves;
}

/**
 * Toutes les questions d'un statut, sans tri.
 *
 * **Pas de `orderBy`, et c'est délibéré.** L'écran de statistiques classe par
 * taux d'échec, un calcul qu'il fait lui-même : lui imposer un tri Firestore
 * n'apporterait rien et réclamerait un index composite pour une lecture qui
 * s'en passe. Un filtre d'égalité seul se sert de l'index à champ unique,
 * automatique.
 */
export async function chargerQuestionsParStatut(statut: StatutQuestion): Promise<Question[]> {
  const instantane = await getDocs(
    query(collection(baseDeDonnees(), 'questions'), where('statut', '==', statut)),
  );

  return instantane.docs.map((document) => enQuestion(document.id, document.data()));
}

/**
 * Compte les questions d'un filtre sans les lire. L'agrégat se facture une
 * lecture par millier de documents : le pied de liste peut donc annoncer un
 * total exact sans rapatrier la banque pour le calculer.
 */
export async function compterQuestions(filtres: FiltresQuestions): Promise<number> {
  const liste: QueryConstraint[] = [];
  if (filtres.statut) liste.push(where('statut', '==', filtres.statut));
  if (filtres.type) liste.push(where('type', '==', filtres.type));
  if (filtres.formationId) {
    liste.push(where('formationIds', 'array-contains', filtres.formationId));
  }

  const agregat = await getCountFromServer(
    query(collection(baseDeDonnees(), 'questions'), ...liste),
  );

  return agregat.data().count;
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
    // Champ dérivé, jamais saisi : c'est lui que la détection de doublons
    // interroge, Firestore ne sachant comparer que des chaînes exactes.
    enonceNormalise: normaliserEnonce(question.enonce),
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
    enonceNormalise: normaliserEnonce(question.enonce),
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
