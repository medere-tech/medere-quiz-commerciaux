'use client';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';

import { baseDeDonnees } from '@/lib/firebase/firestore';
import { enQuestion, type Question } from '@/lib/questions/lecture';

/**
 * Accès à la séance collective.
 *
 * **Tout l'état vit dans Firestore, rien dans un onglet.** C'est ce qui permet
 * à l'animatrice de fermer son navigateur en cours de séance sans que rien ne
 * se perde : à la réouverture, elle retrouve la question en cours, le nombre de
 * réponses et la révélation exactement où ils étaient. C'est aussi ce qui rend
 * le format hybride tenable — la question est poussée sur l'appareil de chacun
 * par un écouteur temps réel, jamais lue sur l'écran partagé, qui a plusieurs
 * secondes de retard en visioconférence.
 */

export type StatutSession = 'attente' | 'encours' | 'pause' | 'terminee' | 'abandonnee';

/** Une séance qu'on peut encore rejoindre et où la question vit. */
export const EN_COURS: StatutSession[] = ['encours', 'pause'];

export type Session = {
  id: string;
  code: string;
  questionIds: string[];
  indexCourant: number;
  revelee: boolean;
  statut: StatutSession;
  animateurUid: string;
  /** Un entier par option de la question en cours, dans l'ordre d'affichage. */
  repartition: number[];
  repondants: number;
  dureeQuestionSecondes: number;
  /** Instant où la question en cours a été poussée. Millisecondes. */
  questionOuverteLeMs: number | null;
  /** Date de création, pour dater une séance dans l'historique. */
  creeeLeMs: number | null;
};

/** Une ligne du bilan : ce qu'une question a produit, sans dire chez qui. */
export type LigneBilan = {
  questionId: string;
  reponses: number;
  echecs: number;
};

export type ReponseSession = {
  uid: string;
  questionId: string;
  optionsChoisies: string[];
  correcte: boolean;
};

export type Participant = { uid: string; nom: string; avatar: string };

export type Distinction = 'diamant' | 'or' | 'argent';

export type Rang = {
  uid: string;
  nom: string;
  avatar: string;
  justes: number;
  rang: number;
  distinction: Distinction | null;
};

export type Prix = {
  sessionId: string;
  codeSession: string;
  distinction: Distinction | null;
  rang: number;
  justes: number;
  participants: number;
  obtenuLeMs: number | null;
};

/** Longueur maximale du nom affiché au classement. Voir `firestore.rules`. */
export const NOM_SESSION_MAX = 32;

/**
 * Nettoie un nom d'affichage avant de l'écrire.
 *
 * Les règles refusent déjà les caractères de contrôle et les noms trop longs.
 * On les retire ici aussi, pour que le refus n'arrive jamais : un nom collé
 * depuis un tableur porte souvent une tabulation ou un retour à la ligne, et
 * l'utilisateur n'a aucune raison de savoir pourquoi son nom est rejeté.
 */
export function nomAffichable(nom: string): string {
  return Array.from(nom)
    .filter((caractere) => {
      const code = caractere.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('')
    .trim()
    .slice(0, NOM_SESSION_MAX);
}

/**
 * Les horodatages Firestore arrivent parfois `null` : entre l'écriture locale
 * et la confirmation du serveur, `serverTimestamp()` n'a pas encore de valeur.
 * L'écouteur reçoit alors un instantané où le champ manque. On rend `null`
 * plutôt que `Date.now()`, qui donnerait une échéance fausse de quelques
 * centaines de millisecondes — et un chronomètre qui saute.
 */
function enMillisecondes(valeur: unknown): number | null {
  if (valeur && typeof valeur === 'object' && 'toMillis' in valeur) {
    return (valeur as { toMillis: () => number }).toMillis();
  }
  return null;
}

function lireSession(id: string, donnees: Record<string, unknown>): Session {
  return {
    id,
    code: typeof donnees.code === 'string' ? donnees.code : '',
    questionIds: Array.isArray(donnees.questionIds) ? (donnees.questionIds as string[]) : [],
    indexCourant: typeof donnees.indexCourant === 'number' ? donnees.indexCourant : 0,
    revelee: donnees.revelee === true,
    statut: (donnees.statut as StatutSession) ?? 'attente',
    animateurUid: typeof donnees.animateurUid === 'string' ? donnees.animateurUid : '',
    repartition: Array.isArray(donnees.repartition) ? (donnees.repartition as number[]) : [],
    repondants: typeof donnees.repondants === 'number' ? donnees.repondants : 0,
    dureeQuestionSecondes:
      typeof donnees.dureeQuestionSecondes === 'number' ? donnees.dureeQuestionSecondes : 0,
    questionOuverteLeMs: enMillisecondes(donnees.questionOuverteLe),
    creeeLeMs: enMillisecondes(donnees.creeeLe),
  };
}

/* ------------------------------------------------------- côté participant */

/**
 * Retrouve une séance par son code, lu à voix haute puis saisi à la main.
 *
 * La requête ne porte que sur le code — une seule égalité, donc aucun index
 * composite à déployer. Le tri se fait ici : une séance terminée ne se rejoint
 * pas, et si le même code a resservi, c'est la séance ouverte qui gagne.
 */
export async function chercherSessionParCode(code: string): Promise<Session | null> {
  const instantane = await getDocs(
    query(collection(baseDeDonnees(), 'sessions'), where('code', '==', code.trim()), limit(5)),
  );

  const seances = instantane.docs.map((document) => lireSession(document.id, document.data()));
  return seances.find((seance) => EN_COURS.includes(seance.statut)) ?? null;
}

/**
 * Écoute la séance. C'est par ici que la question arrive sur chaque appareil.
 *
 * `fromCache` dit que l'instantané vient du cache local, faute de connexion :
 * l'écran peut alors annoncer qu'il est hors ligne plutôt que d'afficher une
 * question périmée sans le dire. Firestore n'expose pas l'état du lien
 * autrement.
 */
export function ecouterSession(
  sessionId: string,
  aChaqueEtat: (session: Session | null, horsLigne: boolean) => void,
): Unsubscribe {
  return onSnapshot(doc(baseDeDonnees(), 'sessions', sessionId), (instantane) => {
    aChaqueEtat(
      instantane.exists() ? lireSession(instantane.id, instantane.data()) : null,
      instantane.metadata.fromCache,
    );
  });
}

/**
 * Se déclarer présent, sous le nom qu'on choisit.
 *
 * **Le nom est publié par son porteur.** Sans ce marqueur, l'animatrice ne
 * saurait pas nommer les votes : elle lit les réponses, qui ne portent qu'un
 * uid, et `users/{uid}` lui est fermé — sans exception administrateur. Chacun
 * publie donc son propre nom, pour cette séance, et personne ne va le chercher
 * dans les données privées de quelqu'un d'autre.
 *
 * Le choix est aussi gardé sur le document utilisateur, pour être proposé
 * d'emblée la semaine suivante.
 */
export async function rejoindre(
  sessionId: string,
  uid: string,
  nom: string,
  avatar: string,
): Promise<void> {
  const propre = nomAffichable(nom);
  const base = baseDeDonnees();
  const lot = writeBatch(base);

  lot.set(doc(base, 'sessions', sessionId, 'participants', uid), {
    nom: propre,
    avatar,
    rejointLe: serverTimestamp(),
  });
  lot.update(doc(base, 'users', uid), { nomSession: propre, avatar });

  await lot.commit();
}

/**
 * Enregistre une réponse de séance.
 *
 * **Trois documents, un seul lot.** La réponse de séance, pour que l'animatrice
 * voie le vote en direct ; la réponse personnelle, pour que la progression
 * avance ; l'état de la question, pour qu'elle revienne dans « à revoir » si
 * elle est ratée. Ou les trois sont écrits, ou aucun : une réponse comptée dans
 * la séance mais absente de la progression donnerait un classement juste et un
 * historique faux.
 *
 * **Une seule agrégation.** Seule la réponse personnelle déclenche le calcul
 * de `questionStats` — le déclencheur sur les réponses de séance ne fait que
 * compter les votes. Agréger des deux côtés compterait chaque réponse deux
 * fois : deux événements distincts, donc deux identifiants, que le
 * dédoublonnage ne rattrape pas.
 *
 * Les règles refusent l'écriture si la bonne réponse est déjà révélée. Ce
 * refus-là n'est pas une panne : il faut le dire à qui a répondu trop tard.
 */
export async function repondreEnSession(
  sessionId: string,
  uid: string,
  questionId: string,
  optionsChoisies: string[],
  correcte: boolean,
): Promise<void> {
  const base = baseDeDonnees();
  const lot = writeBatch(base);

  lot.set(doc(base, 'sessions', sessionId, 'reponses', `${uid}_${questionId}`), {
    uid,
    questionId,
    optionsChoisies,
    correcte,
    repondueLe: serverTimestamp(),
  });

  lot.set(doc(base, 'users', uid, 'reponses', `${questionId}_${Date.now()}`), {
    questionId,
    correcte,
    optionsChoisies,
    origine: 'session',
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

/** Le classement final, lisible par les seuls présents. */
export function ecouterClassement(
  sessionId: string,
  aChaqueEtat: (rangs: Rang[] | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(baseDeDonnees(), 'sessions', sessionId, 'classement', 'final'),
    (instantane) => {
      if (!instantane.exists()) {
        aChaqueEtat(null);
        return;
      }
      const rangs = instantane.data().rangs;
      aChaqueEtat(Array.isArray(rangs) ? (rangs as Rang[]) : []);
    },
    // Un absent se voit refuser la lecture : ce n'est pas une panne, c'est la
    // règle qui fonctionne. L'écran affiche alors qu'il n'était pas là.
    () => aChaqueEtat(null),
  );
}

/** Les prix gagnés, du plus récent au plus ancien. Privés, par construction. */
export async function chargerMesPrix(uid: string): Promise<Prix[]> {
  const instantane = await getDocs(collection(baseDeDonnees(), 'users', uid, 'prix'));

  return instantane.docs
    .map((document) => {
      const donnees = document.data();
      return {
        sessionId: document.id,
        codeSession: typeof donnees.codeSession === 'string' ? donnees.codeSession : '',
        distinction: (donnees.distinction as Distinction | null) ?? null,
        rang: typeof donnees.rang === 'number' ? donnees.rang : 0,
        justes: typeof donnees.justes === 'number' ? donnees.justes : 0,
        participants: typeof donnees.participants === 'number' ? donnees.participants : 0,
        obtenuLeMs: enMillisecondes(donnees.obtenuLe),
      };
    })
    .sort((a, b) => (b.obtenuLeMs ?? 0) - (a.obtenuLeMs ?? 0));
}

/* --------------------------------------------------------- côté animatrice */

/** Code court, lu à voix haute : ni O ni 0, ni I ni 1, qu'on confond à l'oral. */
const ALPHABET_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function codeNeuf(longueur = 6): string {
  const valeurs = new Uint32Array(longueur);
  crypto.getRandomValues(valeurs);
  return Array.from(valeurs, (valeur) => ALPHABET_CODE[valeur % ALPHABET_CODE.length]).join('');
}

export async function creerSession(
  animateurUid: string,
  questionIds: string[],
  dureeQuestionSecondes: number,
  /** `attente` pour une séance préparée à l'avance, `encours` pour l'ouvrir. */
  statut: StatutSession = 'encours',
): Promise<string> {
  const reference = await addDoc(collection(baseDeDonnees(), 'sessions'), {
    code: codeNeuf(),
    questionIds,
    indexCourant: 0,
    revelee: false,
    statut,
    animateurUid,
    creeeLe: serverTimestamp(),
    repartition: [],
    repondants: 0,
    dureeQuestionSecondes,
    questionOuverteLe: serverTimestamp(),
  });

  return reference.id;
}

/**
 * La séance en cours de cette animatrice, s'il y en a une.
 *
 * **C'est la réponse à « et si elle ferme son onglet ».** Rien n'est perdu :
 * l'état vit dans Firestore, et elle le retrouve ici. Une seule égalité dans la
 * requête, donc aucun index composite.
 */
export async function maSessionEnCours(animateurUid: string): Promise<Session | null> {
  const instantane = await getDocs(
    query(
      collection(baseDeDonnees(), 'sessions'),
      where('animateurUid', '==', animateurUid),
      limit(20),
    ),
  );

  return (
    instantane.docs
      .map((document) => lireSession(document.id, document.data()))
      .find((seance) => EN_COURS.includes(seance.statut)) ?? null
  );
}

export function ecouterReponses(
  sessionId: string,
  aChaqueEtat: (reponses: ReponseSession[]) => void,
): Unsubscribe {
  return onSnapshot(
    collection(baseDeDonnees(), 'sessions', sessionId, 'reponses'),
    (instantane) => {
      aChaqueEtat(
        instantane.docs.map((document) => {
          const donnees = document.data();
          return {
            uid: typeof donnees.uid === 'string' ? donnees.uid : '',
            questionId: typeof donnees.questionId === 'string' ? donnees.questionId : '',
            optionsChoisies: Array.isArray(donnees.optionsChoisies)
              ? (donnees.optionsChoisies as string[])
              : [],
            correcte: donnees.correcte === true,
          };
        }),
      );
    },
  );
}

export function ecouterParticipants(
  sessionId: string,
  aChaqueEtat: (participants: Participant[]) => void,
): Unsubscribe {
  return onSnapshot(
    collection(baseDeDonnees(), 'sessions', sessionId, 'participants'),
    (instantane) => {
      aChaqueEtat(
        instantane.docs.map((document) => {
          const donnees = document.data();
          return {
            uid: document.id,
            nom: typeof donnees.nom === 'string' ? donnees.nom : '',
            avatar: typeof donnees.avatar === 'string' ? donnees.avatar : 'encre',
          };
        }),
      );
    },
  );
}

/**
 * Révèle la bonne réponse, et publie la répartition.
 *
 * **La répartition est écrite ici, une fois.** Un participant ne peut pas la
 * calculer : il ne lit pas les réponses des autres, et c'est exactement ce
 * qu'on veut. Elle lui est donc donnée, déjà agrégée, sans aucun identifiant.
 */
export async function revelerReponse(
  sessionId: string,
  repartition: number[],
  repondants: number,
): Promise<void> {
  await updateDoc(doc(baseDeDonnees(), 'sessions', sessionId), {
    revelee: true,
    repartition,
    repondants,
  });
}

/** Pousse la question suivante : nouvelle échéance, compteurs remis à zéro. */
export async function questionSuivante(sessionId: string, indexCourant: number): Promise<void> {
  await updateDoc(doc(baseDeDonnees(), 'sessions', sessionId), {
    indexCourant,
    revelee: false,
    repartition: [],
    repondants: 0,
    questionOuverteLe: serverTimestamp(),
  });
}

/**
 * Clôt la séance. C'est ce passage à `terminee` que la Cloud Function attend
 * pour calculer le classement et écrire les prix.
 */
export async function terminerSession(sessionId: string): Promise<void> {
  await updateDoc(doc(baseDeDonnees(), 'sessions', sessionId), {
    statut: 'terminee',
    revelee: true,
  });
}

/**
 * Rouvre le vote sur la question en cours.
 *
 * **Le nom dit ce que la fonction fait.** Elle s'appelait « rejouer », et le
 * bouton avec : or personne ne rejoue. Les règles refusent une seconde réponse
 * à la même question — garantie du lot 1, sur laquelle repose le compte du
 * classement. Rouvrir sert à ceux qui n'avaient pas répondu. Devant une salle,
 * un libellé qui promet plus qu'il ne tient est pire qu'un libellé modeste.
 *
 * **Le chronomètre repart en entier.** Rejouer un vote, c'est rouvrir la
 * question : la salle doit retrouver son temps. Sans reposer
 * `questionOuverteLe`, l'échéance restait celle de la première ouverture, et
 * l'on rejouait avec un décompte déjà écoulé. Comme tout le reste de l'état, la
 * nouvelle échéance part sur l'écouteur temps réel : les participants la
 * reçoivent en même temps que l'écran projeté.
 *
 * **Les réponses déjà données ne sont pas effacées**, et `repondants` n'est pas
 * remis à zéro : les compteurs porteraient sinon sur une salle qui a déjà voté.
 * Qui a répondu ne revote pas — les règles refusent une seconde écriture sur la
 * même question. Rouvrir sert à ceux qui n'avaient pas répondu.
 */
export async function rouvrirLeVote(sessionId: string): Promise<void> {
  await updateDoc(doc(baseDeDonnees(), 'sessions', sessionId), {
    revelee: false,
    repartition: [],
    questionOuverteLe: serverTimestamp(),
  });
}

/** Le nom proposé d'emblée : celui de la semaine dernière, sinon le nom réel. */
export async function memoriserNomSession(uid: string, nom: string): Promise<void> {
  await setDoc(
    doc(baseDeDonnees(), 'users', uid),
    { nomSession: nomAffichable(nom) },
    { merge: true },
  );
}

/* --------------------------------------------------------- historique */

/**
 * Le bilan anonyme d'une séance close.
 *
 * Deux compteurs par question, aucun identifiant : c'est tout ce qui reste
 * lisible une fois la séance terminée. La lecture nominative des votes s'éteint
 * avec la séance — voir `firestore.rules`.
 */
export async function chargerBilan(sessionId: string): Promise<LigneBilan[] | null> {
  const instantane = await getDoc(doc(baseDeDonnees(), 'sessions', sessionId, 'bilan', 'final'));
  if (!instantane.exists()) return null;

  const questions = instantane.data().questions;
  return Array.isArray(questions) ? (questions as LigneBilan[]) : [];
}

/**
 * Les séances ouvertes en ce moment, pour le bandeau de l'accueil.
 *
 * Une seule égalité dans la requête, donc aucun index composite. Une séance en
 * pause n'est pas annoncée : inviter à rejoindre un écran qui dit « en pause »
 * serait une promesse déçue.
 */
export async function seanceOuverte(): Promise<Session | null> {
  const instantane = await getDocs(
    query(collection(baseDeDonnees(), 'sessions'), where('statut', '==', 'encours'), limit(3)),
  );

  const seances = instantane.docs.map((document) => lireSession(document.id, document.data()));
  return seances[0] ?? null;
}

/* ------------------------------------------------- arrêter, suspendre */

/**
 * Suspend la séance.
 *
 * Le vote se ferme côté serveur — les règles n'acceptent une réponse que sur
 * une séance `encours`. L'écran des participants dit qu'on est en pause, plutôt
 * que de rester figé sur une question à laquelle plus personne ne peut
 * répondre : une question gelée sur dix téléphones est pire qu'un message.
 */
export async function mettreEnPause(sessionId: string): Promise<void> {
  await updateDoc(doc(baseDeDonnees(), 'sessions', sessionId), { statut: 'pause' });
}

/**
 * Reprend la séance là où elle en était.
 *
 * **Le chronomètre repart en entier.** Une pause de dix minutes laisserait sinon
 * une échéance dépassée, et la question rouvrirait sur « temps écoulé ». On
 * repose donc l'instant d'ouverture : la salle retrouve le temps qu'elle avait.
 */
export async function reprendre(sessionId: string): Promise<void> {
  await updateDoc(doc(baseDeDonnees(), 'sessions', sessionId), {
    statut: 'encours',
    questionOuverteLe: serverTimestamp(),
  });
}

/**
 * Interrompt la séance sans la classer.
 *
 * **Pour quand le résultat ne voudrait rien dire** : la visioconférence tombe,
 * une question se révèle inutilisable, la moitié de la salle est partie. Aucun
 * classement, aucun prix.
 *
 * **Les réponses déjà données restent.** Elles étaient réelles : elles comptent
 * dans la progression de chacun et dans les questions à revoir, comme n'importe
 * quelle réponse d'entraînement. Seul le classement collectif n'a pas lieu.
 *
 * **C'est définitif.** Rouvrir une séance abandonnée ferait voter sur des
 * questions auxquelles la moitié de la salle a déjà répondu, et produirait un
 * classement mêlant deux moments. Pour recommencer, on prépare une nouvelle
 * séance — les mêmes questions se resélectionnent en deux gestes.
 */
export async function abandonner(sessionId: string): Promise<void> {
  await updateDoc(doc(baseDeDonnees(), 'sessions', sessionId), { statut: 'abandonnee' });
}

/* ------------------------------------------------- séances préparées */

/** Les séances de cette animatrice, la plus récente d'abord. */
export async function mesSeances(animateurUid: string): Promise<Session[]> {
  const instantane = await getDocs(
    query(
      collection(baseDeDonnees(), 'sessions'),
      where('animateurUid', '==', animateurUid),
      limit(50),
    ),
  );

  return instantane.docs.map((document) => lireSession(document.id, document.data()));
}

/** Ouvre une séance préparée. Le chronomètre part maintenant, pas à la création. */
export async function lancerSeance(sessionId: string): Promise<void> {
  await updateDoc(doc(baseDeDonnees(), 'sessions', sessionId), {
    statut: 'encours',
    questionOuverteLe: serverTimestamp(),
  });
}

/** Supprime une séance préparée qui ne servira pas. */
export async function supprimerSeance(sessionId: string): Promise<void> {
  await deleteDoc(doc(baseDeDonnees(), 'sessions', sessionId));
}

/* --------------------------------------------------- la question, en direct */

/**
 * Écoute la question en cours.
 *
 * **Pourquoi elle ne peut pas venir du référentiel seul.** Les deux écrans de
 * séance reçoivent le référentiel des questions publiées avec le HTML, rendu
 * par le serveur. C'est ce qui les fait apparaître pleins dès le premier
 * affichage. Mais la page ne se recharge plus de toute la séance : le
 * référentiel est donc figé pour une heure, et une explication corrigée en
 * cours de route n'apparaissait qu'à la séance suivante.
 *
 * Or c'est exactement là que Noémie corrige — elle vient de voir l'explication
 * échouer devant la salle. Un écouteur sur la seule question affichée suffit :
 * un document, un abonnement, et la correction arrive par le même canal que la
 * question elle-même.
 *
 * Rend `null` si la question n'existe plus ou n'est plus publiée : l'écran le
 * dit, plutôt que d'afficher un énoncé retiré.
 */
export function ecouterQuestion(
  questionId: string,
  aChaqueEtat: (question: Question | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(baseDeDonnees(), 'questions', questionId),
    (instantane) => {
      if (!instantane.exists()) {
        aChaqueEtat(null);
        return;
      }
      const question = enQuestion(instantane.id, instantane.data());
      aChaqueEtat(question.statut === 'publiee' ? question : null);
    },
    // Une lecture refusée n'est pas une raison de vider l'écran : le
    // référentiel rendu par le serveur reste affiché.
    () => {},
  );
}

/**
 * Ma propre réponse à une question de séance, s'il y en a une.
 *
 * **Elle survit au rechargement.** Un participant qui recharge sa page, ou qui
 * revient après une coupure, retrouvait un écran vierge et un bouton « Envoyer »
 * actif — alors que les règles refusent une seconde réponse à la même question.
 * Il se serait fait refuser sans comprendre.
 */
export async function chargerMaReponse(
  sessionId: string,
  uid: string,
  questionId: string,
): Promise<string[] | null> {
  const instantane = await getDoc(
    doc(baseDeDonnees(), 'sessions', sessionId, 'reponses', `${uid}_${questionId}`),
  );
  if (!instantane.exists()) return null;

  const choisies = instantane.data().optionsChoisies;
  return Array.isArray(choisies) ? (choisies as string[]) : [];
}
