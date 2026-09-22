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
import {
  explicationAChange,
  STATUTS_SERVIS,
  type QuestionAEcrire,
  type StatutQuestion,
  type TypeQuestion,
} from '@/lib/questions/modele';

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
 * Les questions qui sortent aux commerciaux — publiées et à relire.
 *
 * C'est la population dont parlent les statistiques : un brouillon n'a jamais
 * été posé, il n'a pas de taux d'échec, et l'y faire figurer ferait un
 * dénominateur faux.
 */
export async function chargerQuestionsServies(): Promise<Question[]> {
  const instantane = await getDocs(
    query(collection(baseDeDonnees(), 'questions'), where('statut', 'in', [...STATUTS_SERVIS])),
  );

  return instantane.docs.map((document) => enQuestion(document.id, document.data()));
}

/**
 * Marquer une question à relire, ou la republier telle quelle.
 *
 * **Une écriture d'un seul champ, et elle ne retire rien aux commerciaux.**
 * C'est ce qui rend le geste sans conséquence : Noémie peut marquer librement
 * depuis l'écran des statistiques, la question continue de sortir. Pour la
 * retirer, il y a le brouillon — c'est un autre geste, et il se voit.
 *
 * `modifieeLe` avance : la banque classe par récence, et un marquage est une
 * modification. La date de l'explication, elle, ne bouge pas — le texte n'a
 * pas changé.
 */
export async function marquerStatut(
  identifiant: string,
  statut: StatutQuestion,
): Promise<void> {
  await updateDoc(doc(baseDeDonnees(), 'questions', identifiant), {
    statut,
    modifieeLe: serverTimestamp(),
  });
}

/** Combien de questions sortent aux commerciaux — publiées et à relire. */
export async function compterQuestionsServies(): Promise<number> {
  const agregat = await getCountFromServer(
    query(collection(baseDeDonnees(), 'questions'), where('statut', 'in', [...STATUTS_SERVIS])),
  );
  return agregat.data().count;
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

/**
 * Combien de questions servies chaque formation porte.
 *
 * **Une agrégation par formation, et c'est le moins cher des chemins
 * possibles.** `getCountFromServer` coûte une unité de lecture par requête,
 * quel que soit le nombre de questions comptées : soixante formations valent
 * soixante unités. L'alternative — lire toutes les questions et compter en
 * mémoire — en coûterait deux cents et téléchargerait l'énoncé, l'explication
 * et l'argumentaire de chacune sur un écran qui ne les affiche pas. C'est
 * exactement la règle de `CLAUDE.md` : ce qu'un écran ne peint pas, il ne doit
 * pas le télécharger.
 *
 * **Le parallélisme est borné, mais pas trop** — et la borne a été mesurée,
 * pas devinée. Par vagues de huit, les soixante chiffres d'une page mettaient
 * **huit secondes** à se poser ; par vagues de vingt-quatre, deux et demie.
 * Firestore répond en HTTP/2, qui multiplexe sur une seule connexion : la
 * limite de six requêtes par hôte du HTTP/1.1, qui justifiait la prudence, ne
 * s'applique pas.
 *
 * **La file s'arrête quand l'écran part, et c'est une correction de
 * régression.** Sans le signal, les soixante requêtes survivaient au
 * démontage : l'écran suivant attendait derrière elles. **Mesuré : 24 978 ms
 * pour atteindre les séances depuis les formations, contre 1 824 ms sans y
 * passer — treize fois.** Un drapeau `vivant` empêche d'écrire dans un
 * composant démonté ; il n'empêche pas une requête de partir. Le signal, lui,
 * arrête l'émission — c'est ce que la borne de parallélisme rend possible :
 * une vague en vol au plus, jamais soixante.
 *
 * Le SDK Firestore n'accepte pas de signal d'abandon sur `getCountFromServer` :
 * ce qui est déjà parti ne s'annule pas. C'est pourquoi la vague est petite.
 *
 * Une formation dont le comptage échoue n'entre pas dans la carte rendue : un
 * chiffre qu'on ne sait pas calculer ne s'affiche pas — ni zéro, ni tiret.
 */
const COMPTAGES_SIMULTANES = 24;

export async function compterServiesParFormation(
  formationIds: string[],
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const comptes = new Map<string, number>();

  for (let debut = 0; debut < formationIds.length; debut += COMPTAGES_SIMULTANES) {
    if (signal?.aborted) break;
    const vague = formationIds.slice(debut, debut + COMPTAGES_SIMULTANES);
    await Promise.all(
      vague.map(async (identifiant) => {
        if (signal?.aborted) return;
        try {
          const agregat = await getCountFromServer(
            query(
              collection(baseDeDonnees(), 'questions'),
              where('statut', 'in', [...STATUTS_SERVIS]),
              where('formationIds', 'array-contains', identifiant),
            ),
          );
          comptes.set(identifiant, agregat.data().count);
        } catch (panne) {
          /* Un compteur de carte n'est pas une panne d'écran : on le
             journalise et la carte s'affiche sans son chiffre. */
          console.error(`Comptage impossible pour la formation ${identifiant}`, panne);
        }
      }),
    );
  }

  return comptes;
}

/**
 * Les brouillons, comptés par formation et au total.
 *
 * **Une seule requête ici, et non une agrégation par formation.** Le
 * raisonnement est l'inverse du précédent, et c'est la population qui le
 * décide : les brouillons sont le petit bout de la banque — ce qui n'est pas
 * encore sorti. Les lire une fois coûte moins que soixante agrégations, et
 * donne en prime **quelles** formations en portent, ce qu'un compte global ne
 * dirait pas.
 *
 * Si les brouillons devenaient nombreux au point que cette lecture pèse, c'est
 * qu'il y aurait un autre problème : une banque à moitié publiée.
 */
export async function compterBrouillonsParFormation(): Promise<{
  parFormation: Map<string, number>;
  total: number;
}> {
  const instantane = await getDocs(
    query(collection(baseDeDonnees(), 'questions'), where('statut', '==', 'brouillon')),
  );

  const parFormation = new Map<string, number>();
  for (const document of instantane.docs) {
    const donnees = document.data();
    const identifiants = Array.isArray(donnees.formationIds) ? donnees.formationIds : [];
    for (const identifiant of identifiants) {
      if (typeof identifiant !== 'string') continue;
      parFormation.set(identifiant, (parFormation.get(identifiant) ?? 0) + 1);
    }
  }

  return { parFormation, total: instantane.size };
}

export async function chargerQuestion(identifiant: string): Promise<Question | null> {
  const document = await getDoc(doc(baseDeDonnees(), 'questions', identifiant));
  return document.exists() ? enQuestion(document.id, document.data()) : null;
}

export async function creerQuestion(
  question: QuestionAEcrire,
  auteur: string,
  /**
   * Le nom sous lequel l'explication est signée.
   *
   * **Recopié par celle qui écrit, jamais lu ailleurs.** `users/{uid}` est
   * fermé sans exception administrateur : aller y chercher le nom depuis une
   * question serait refusé par les règles. C'est le motif déjà retenu pour
   * l'animatrice d'une séance et pour les marqueurs de présence — chacun
   * publie son propre nom, personne ne lit les données privées d'un autre.
   */
  auteurNom: string,
): Promise<string> {
  const reference = await addDoc(collection(baseDeDonnees(), 'questions'), {
    ...question,
    // Champ dérivé, jamais saisi : c'est lui que la détection de doublons
    // interroge, Firestore ne sachant comparer que des chaînes exactes.
    enonceNormalise: normaliserEnonce(question.enonce),
    explicationAuteur: auteurNom,
    explicationMajLe: serverTimestamp(),
    creeePar: auteur,
    creeeLe: serverTimestamp(),
    modifieeLe: serverTimestamp(),
  });
  return reference.id;
}

export async function enregistrerQuestion(
  identifiant: string,
  question: QuestionAEcrire,
  signature: {
    /** L'explication et l'argumentaire tels qu'ils étaient avant cette saisie. */
    precedente: { explication: string; argumentaire: string };
    /** Le nom de qui enregistre, recopié si le texte a changé. */
    auteurNom: string;
  },
): Promise<void> {
  /*
   * **La date de l'explication ne bouge que si l'explication bouge.**
   *
   * `modifieeLe` suit chaque enregistrement — c'est ce qui classe la banque
   * par récence, et c'est juste. Mais l'écran du commercial annonce « mise à
   * jour le… » à côté de l'explication : une correction de faute de frappe qui
   * ferait avancer cette date-là n'apprendrait rien à personne. Les deux
   * champs de signature restent donc hors de l'écriture quand rien n'a changé,
   * et gardent leur valeur.
   */
  const signee = explicationAChange(signature.precedente, question)
    ? { explicationAuteur: signature.auteurNom, explicationMajLe: serverTimestamp() }
    : {};

  // `sourceFiche` et `sourceVersion` sont facultatifs : quand ils sont vidés,
  // il faut les effacer du document, pas les laisser à leur ancienne valeur.
  await updateDoc(doc(baseDeDonnees(), 'questions', identifiant), {
    ...question,
    ...signee,
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
  auteurNom: string,
): Promise<string> {
  const copie: QuestionAEcrire = {
    type: question.type,
    contexte: question.type === 'scenario' ? question.contexte : null,
    enonce: `${question.enonce} (copie)`.slice(0, 500),
    options: question.options,
    ordreOptions: question.ordreOptions,
    bonnesReponses: question.bonnesReponses,
    explication: question.explication,
    argumentaire: question.argumentaire,
    formationIds: question.formationIds,
    theme: question.theme,
    difficulte: question.difficulte,
    statut: 'brouillon',
  };

  if (question.sourceFiche) copie.sourceFiche = question.sourceFiche;
  if (question.sourceVersion) copie.sourceVersion = question.sourceVersion;

  return creerQuestion(copie, auteur, auteurNom);
}

export async function supprimerQuestion(identifiant: string): Promise<void> {
  await deleteDoc(doc(baseDeDonnees(), 'questions', identifiant));
}
