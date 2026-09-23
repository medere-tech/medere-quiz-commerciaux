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
import { enMillisecondes } from '@/lib/firebase/horodatage';
import { estServie } from '@/lib/questions/modele';
import { enQuestion, type Question } from '@/lib/questions/lecture';
import {
  descriptionAffichable,
  nomAffichable,
  titreAffichable,
} from '@/lib/session/seance';

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
  /** Ce que la séance annonce d'elle-même. Saisi à la composition. */
  titre: string;
  /** Une phrase sur ce que la séance couvre. Peut rester vide. */
  description: string;
  /** Le nom de l'animatrice, qu'elle publie elle-même. Voir `seance.ts`. */
  animateurNom: string;
  questionIds: string[];
  indexCourant: number;
  revelee: boolean;
  /**
   * La première question a-t-elle été poussée ?
   *
   * **Trois moments, pas deux.** `attente` dit « composée, pas ouverte » : le
   * code ne vaut rien, personne ne peut rejoindre. `encours` avec `demarree`
   * faux dit « la salle est ouverte, on attend le monde » — c'est la salle
   * d'attente, où le code se dicte et les présents arrivent. `encours` avec
   * `demarree` vrai dit « la première question est posée ». Le statut seul ne
   * savait pas distinguer les deux derniers, et la salle d'attente est
   * précisément l'écran qui vit entre eux.
   */
  demarree: boolean;
  /**
   * L'accès est-il fermé aux nouveaux venus ?
   *
   * **Il ne ferme que la porte, jamais la salle.** Rien ne change pour qui est
   * déjà entré : le marqueur de présence existe, le vote reste ouvert, le
   * classement reste dû. Seule la création d'un marqueur est refusée — c'est
   * exactement ce que les règles vérifient, et c'est tout ce qu'elles
   * vérifient.
   *
   * **Réversible, et c'est la moitié de la fonctionnalité.** Un retardataire
   * légitime arrive toujours ; Noémie rouvre d'un clic depuis le même endroit.
   * Un verrou qu'on ne peut pas défaire ne se poserait jamais.
   */
  verrouillee: boolean;
  statut: StatutSession;
  animateurUid: string;
  /**
   * Combien de personnes sont attendues.
   *
   * **C'est le dénominateur de « 8 sur 10 », et il ne se devine pas.** L'outil
   * n'a pas de liste d'invités — le code est dit à voix haute, et quiconque
   * l'entend entre. Noémie déclare donc l'effectif qu'elle attend, et la salle
   * d'attente sait dire combien il en manque. Zéro veut dire « non déclaré » :
   * l'écran affiche alors le nombre de présents, sans dénominateur inventé.
   */
  effectifAttendu: number;
  /** Un entier par option de la question en cours, dans l'ordre d'affichage. */
  repartition: number[];
  repondants: number;
  dureeQuestionSecondes: number;
  /** Instant où la question en cours a été poussée. Millisecondes. */
  questionOuverteLeMs: number | null;
  /** Date de création, pour dater une séance dans l'historique. */
  creeeLeMs: number | null;
  /**
   * Instant de clôture, et compte final des présents.
   *
   * **Écrits par la Cloud Function qui établit le bilan**, au même passage et
   * dans le même lot : c'est la même transition, et deux déclencheurs sur le
   * même événement seraient une course. Ils vivent sur la séance et non dans
   * le bilan parce que la liste des séances passées les affiche par ligne —
   * les lire dans le bilan coûterait une lecture par ligne.
   */
  termineeLeMs: number | null;
  presentsFinal: number;
  /**
   * Instant où la séance a été ouverte. `null` tant qu'elle est en attente.
   *
   * Distinct de `creeeLe` : une séance composée le mardi et lancée le jeudi
   * porte deux dates, et celle qui intéresse quelqu'un qui arrive est la
   * seconde.
   */
  ouverteLeMs: number | null;
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

/**
 * Où se trouve un participant.
 *
 * **La séance est hybride, et l'animatrice doit le savoir.** Une partie de la
 * salle est en visioconférence et voit l'écran projeté avec plusieurs secondes
 * de retard : savoir qui est devant elle et qui est au bout d'un lien change la
 * façon de mener la séance — on n'attend pas de la même façon, on ne commente
 * pas de la même façon. Chacun le déclare en rejoignant.
 */
export type LieuPresence = 'salle' | 'visio';

export const LIEUX_PRESENCE: LieuPresence[] = ['salle', 'visio'];

export const LIBELLES_LIEU: Record<LieuPresence, string> = {
  salle: 'en salle',
  visio: 'en visio',
};

export function estLieuPresence(valeur: unknown): valeur is LieuPresence {
  return valeur === 'salle' || valeur === 'visio';
}

export type Participant = {
  uid: string;
  nom: string;
  avatar: string;
  presence: LieuPresence;
};

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

/*
 * `NOM_SESSION_MAX`, `nomAffichable` et `titreAffichable` vivent désormais dans
 * `seance.ts`, qui n'importe pas le SDK Firestore : un écran qui a seulement
 * besoin de borner un nom n'a pas à embarquer la base de données pour ça.
 */

/**
 * Les horodatages Firestore arrivent parfois `null` : entre l'écriture locale
 * et la confirmation du serveur, `serverTimestamp()` n'a pas encore de valeur.
 * L'écouteur reçoit alors un instantané où le champ manque. On rend `null`
 * plutôt que `Date.now()`, qui donnerait une échéance fausse de quelques
 * centaines de millisecondes — et un chronomètre qui saute.
 */
function lireSession(id: string, donnees: Record<string, unknown>): Session {
  return {
    id,
    code: typeof donnees.code === 'string' ? donnees.code : '',
    titre: typeof donnees.titre === 'string' ? donnees.titre : '',
    description: typeof donnees.description === 'string' ? donnees.description : '',
    animateurNom: typeof donnees.animateurNom === 'string' ? donnees.animateurNom : '',
    questionIds: Array.isArray(donnees.questionIds) ? (donnees.questionIds as string[]) : [],
    indexCourant: typeof donnees.indexCourant === 'number' ? donnees.indexCourant : 0,
    revelee: donnees.revelee === true,
    demarree: donnees.demarree === true,
    verrouillee: donnees.verrouillee === true,
    statut: (donnees.statut as StatutSession) ?? 'attente',
    animateurUid: typeof donnees.animateurUid === 'string' ? donnees.animateurUid : '',
    effectifAttendu: typeof donnees.effectifAttendu === 'number' ? donnees.effectifAttendu : 0,
    repartition: Array.isArray(donnees.repartition) ? (donnees.repartition as number[]) : [],
    repondants: typeof donnees.repondants === 'number' ? donnees.repondants : 0,
    dureeQuestionSecondes:
      typeof donnees.dureeQuestionSecondes === 'number' ? donnees.dureeQuestionSecondes : 0,
    questionOuverteLeMs: enMillisecondes(donnees.questionOuverteLe),
    creeeLeMs: enMillisecondes(donnees.creeeLe),
    ouverteLeMs: enMillisecondes(donnees.ouverteLe),
    termineeLeMs: enMillisecondes(donnees.termineeLe),
    presentsFinal: typeof donnees.presentsFinal === 'number' ? donnees.presentsFinal : 0,
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
 * `fromCache` dit que l'instantané vient du cache local plutôt que du serveur.
 * C'est le seul signal que Firestore expose sur l'état du lien, et l'écran s'en
 * sert pour annoncer qu'il est hors ligne plutôt que de montrer une question
 * périmée sans le dire.
 *
 * **Mais `fromCache` brut ne veut pas dire « hors ligne », et il l'a prouvé
 * deux fois.**
 *
 * *Premier défaut : « pas encore reçu » n'est pas « perdu ».* Le tout premier
 * instantané vient du cache, toujours — c'est ainsi que Firestore répond vite.
 * Le bandeau « Connexion perdue » s'affichait donc à l'arrivée en séance,
 * alors que tout allait bien. C'était la première chose qu'un commercial
 * voyait en entrant, et c'était faux. Le drapeau n'est donc levé qu'une fois
 * le serveur entendu au moins une fois.
 *
 * *Second défaut, et c'est lui qui figeait le bandeau : un rappel qui
 * n'arrivait jamais.* `onSnapshot` ignore par défaut les changements qui ne
 * portent que sur les métadonnées. Le passage cache → serveur, à données
 * identiques, ne rappelait donc pas la fonction : le bandeau restait affiché
 * jusqu'à la prochaine vraie modification de la séance. Mesuré à une quinzaine
 * de secondes, et sans limite en principe — une séance à l'arrêt ne change
 * pas. `includeMetadataChanges` est la réponse, et elle sert dans les deux
 * sens : c'est aussi ce qui permet de voir la connexion *revenir*.
 *
 * **Ce que ce choix laisse passer, et il faut le savoir.** Quelqu'un qui
 * n'aurait jamais joint le serveur ne verra pas le bandeau. Le cas ne se
 * présente pas ici : on n'arrive sur cet écran qu'après avoir rejoint la
 * séance, ce qui est une écriture, et le HTML de la page est `no-store`. Pas
 * de connexion, pas d'écran du tout.
 */
export function ecouterSession(
  sessionId: string,
  aChaqueEtat: (session: Session | null, horsLigne: boolean) => void,
): Unsubscribe {
  let serveurEntendu = false;

  return onSnapshot(
    doc(baseDeDonnees(), 'sessions', sessionId),
    { includeMetadataChanges: true },
    (instantane) => {
      if (!instantane.metadata.fromCache) serveurEntendu = true;

      aChaqueEtat(
        instantane.exists() ? lireSession(instantane.id, instantane.data()) : null,
        serveurEntendu && instantane.metadata.fromCache,
      );
    },
  );
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
 *
 * **L'heure d'arrivée ne se réécrit pas.** Qui a déjà rejoint et revient —
 * onglet rechargé, téléphone reverrouillé, retour par le lien — ne crée pas un
 * second marqueur : il met à jour le sien. Or les règles refusent de faire
 * bouger `rejointLe` sur un marqueur existant, précisément pour que personne ne
 * réécrive son heure d'arrivée. Écrire l'horodatage à chaque passage faisait
 * donc de la reconnexion un refus de permission — l'écran disait « la recherche
 * n'a pas abouti » à quelqu'un qui était déjà dans la salle. On n'écrit
 * l'horodatage que lorsqu'il n'y en a pas.
 *
 * C'est aussi ce qui rend le verrou tenable : verrouiller ferme la porte aux
 * nouveaux venus, et un présent qui recharge son onglet n'en est pas un.
 */
export async function rejoindre(
  sessionId: string,
  uid: string,
  nom: string,
  avatar: string,
  presence: LieuPresence,
): Promise<void> {
  const propre = nomAffichable(nom);
  const base = baseDeDonnees();
  const marqueur = doc(base, 'sessions', sessionId, 'participants', uid);
  const dejaLa = (await getDoc(marqueur)).exists();

  const lot = writeBatch(base);

  lot.set(
    marqueur,
    {
      nom: propre,
      avatar,
      presence,
      ...(dejaLa ? {} : { rejointLe: serverTimestamp() }),
    },
    // Fusion : sur un marqueur existant, `rejointLe` reste celui de la
    // première arrivée. Sur un marqueur neuf, le document est complet — les
    // règles l'exigent, champ par champ.
    { merge: true },
  );
  lot.update(doc(base, 'users', uid), { nomSession: propre, avatar, presence });
  /* **Entrer efface son propre appel.** Sans cette ligne, un retardataire
     admis resterait affiché « à la porte » sur l'écran de l'animatrice, qui
     l'aurait pourtant devant elle. Effacer un document absent ne coûte rien :
     le cas ordinaire est celui d'une entrée sans appel. */
  lot.delete(doc(base, 'sessions', sessionId, 'appels', uid));

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
  /**
   * Ce que la séance annonce d'elle-même.
   *
   * `titre` est ce que Noémie a saisi ; `animateurNom` est son propre nom,
   * qu'elle publie sur la séance parce que personne d'autre ne peut aller le
   * lire — `users/{uid}` est fermé, sans exception administrateur. Même motif
   * que les marqueurs de présence.
   */
  annonce: {
    titre: string;
    description: string;
    animateurNom: string;
    /** Combien de personnes sont attendues. Zéro vaut « non déclaré ». */
    effectifAttendu?: number;
  } = { titre: '', description: '', animateurNom: '' },
): Promise<string> {
  const reference = await addDoc(collection(baseDeDonnees(), 'sessions'), {
    code: codeNeuf(),
    titre: titreAffichable(annonce.titre),
    description: descriptionAffichable(annonce.description),
    animateurNom: nomAffichable(annonce.animateurNom),
    questionIds,
    indexCourant: 0,
    revelee: false,
    // Une séance neuve n'a jamais commencé : la salle d'attente vient d'abord.
    demarree: false,
    // Une salle s'ouvre ouverte. Le verrou est un geste de l'animatrice, jamais
    // un défaut.
    verrouillee: false,
    effectifAttendu: Math.max(0, Math.trunc(annonce.effectifAttendu ?? 0)),
    statut,
    animateurUid,
    creeeLe: serverTimestamp(),
    // Une séance préparée n'est pas encore ouverte : l'heure d'ouverture est
    // posée au lancement, pas à la composition.
    ouverteLe: statut === 'encours' ? serverTimestamp() : null,
    // Posés à la clôture par la Cloud Function du bilan, jamais par le client.
    termineeLe: null,
    presentsFinal: 0,
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
            presence: estLieuPresence(donnees.presence) ? donnees.presence : 'salle',
          };
        }),
      );
    },
  );
}

/**
 * Qui est déjà dans la salle, avant même d'avoir rejoint.
 *
 * **C'est la seule collection nominative de l'outil, et elle s'ouvre le temps
 * de la séance.** Les règles autorisent la liste à tout le domaine tant que la
 * séance est `encours` ou `pause`, et la referment ensuite — exactement la
 * clause qui protège déjà la liste des réponses. Pendant la séance, ce que
 * cette liste montre est ce que la pièce voit en levant les yeux, et ce que
 * l'écran projeté affiche déjà. Après, il n'en reste aucune archive.
 *
 * **Le refus qui suit la clôture n'est pas une panne.** Quand la séance passe à
 * `terminee`, l'écouteur reçoit `permission-denied` : c'est la règle qui
 * fonctionne. On vide la liste, sans rien journaliser. Toute autre erreur
 * remonte — un `catch` ne doit absorber que les causes qu'il sait nommer.
 */
export function ecouterPresents(
  sessionId: string,
  aChaqueEtat: (participants: Participant[] | null) => void,
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
            presence: estLieuPresence(donnees.presence) ? donnees.presence : 'salle',
          };
        }),
      );
    },
    (panne) => {
      if (panne.code === 'permission-denied') {
        aChaqueEtat(null);
        return;
      }
      console.error('Lecture des présents impossible', panne);
      aChaqueEtat(null);
    },
  );
}

/* ----------------------------------------------------- frapper à la porte */

/**
 * Quelqu'un qui a trouvé porte close, et qui le signale.
 *
 * **Le seul canal qui remonte de la salle.** Tout le reste descend — la
 * question, la révélation, le classement. Un participant n'écrit que ce qui le
 * concerne à l'intérieur de la séance ; ici, quelqu'un qui n'est pas dans la
 * pièce adresse une demande.
 */
export type Appel = {
  uid: string;
  nom: string;
  avatar: string;
  /** Quand il a frappé. `null` tant que le serveur n'a pas horodaté. */
  demandeLeMs: number | null;
};

/**
 * Frappe à la porte, ou repousse un appel déjà posé.
 *
 * **Un document par personne, identifié par son uid.** Frapper deux fois
 * réécrit le même document : dix personnes qui insistent ne produisent pas dix
 * lignes sur l'écran de l'animatrice. C'est ce qui rend le rappel inoffensif.
 *
 * Le nom et la couleur sont republiés par leur porteur, comme pour les
 * présences : `users/{uid}` est fermé aux administrateurs, et Noémie ne peut
 * pas aller les chercher.
 */
export async function frapperALaPorte(
  sessionId: string,
  uid: string,
  nom: string,
  avatar: string,
): Promise<void> {
  await setDoc(doc(baseDeDonnees(), 'sessions', sessionId, 'appels', uid), {
    nom: nomAffichable(nom),
    avatar,
    demandeLe: serverTimestamp(),
  });
}

/**
 * Les appels en attente, pour l'animatrice.
 *
 * **Un refus de permission n'est pas une liste vide.** Les règles réservent
 * cette lecture à l'animatrice de la séance : côté commercial, l'écouteur
 * rendrait `null`, et un écran qui afficherait « personne à la porte » sur un
 * refus mentirait. On distingue donc les deux, comme pour les présents.
 */
export function ecouterAppels(
  sessionId: string,
  aChaqueEtat: (appels: Appel[] | null) => void,
): Unsubscribe {
  return onSnapshot(
    collection(baseDeDonnees(), 'sessions', sessionId, 'appels'),
    (instantane) => {
      aChaqueEtat(
        instantane.docs
          .map((document) => {
            const donnees = document.data();
            return {
              uid: document.id,
              nom: typeof donnees.nom === 'string' ? donnees.nom : '',
              avatar: typeof donnees.avatar === 'string' ? donnees.avatar : 'encre',
              demandeLeMs: enMillisecondes(donnees.demandeLe),
            };
          })
          /* Le plus ancien d'abord : celui qui attend depuis le plus longtemps
             est celui qu'on risque d'oublier. Un appel non encore horodaté par
             le serveur passe en dernier — il vient d'arriver. */
          .sort((a, b) => (a.demandeLeMs ?? Infinity) - (b.demandeLeMs ?? Infinity)),
      );
    },
    (panne) => {
      if (panne.code !== 'permission-denied') {
        console.error('Lecture des appels impossible', panne);
      }
      aChaqueEtat(null);
    },
  );
}

/**
 * Mon propre appel — ce qui évite de frapper vingt fois.
 *
 * L'écran du retardataire s'en sert pour montrer que le message est passé, et
 * pour le retrouver après un rechargement : sans cela, un onglet rouvert
 * afficherait de nouveau « Prévenir l'animatrice » comme si rien n'avait été
 * fait.
 */
export function ecouterMonAppel(
  sessionId: string,
  uid: string,
  aChaqueEtat: (appel: Appel | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(baseDeDonnees(), 'sessions', sessionId, 'appels', uid),
    (instantane) => {
      if (!instantane.exists()) {
        aChaqueEtat(null);
        return;
      }
      const donnees = instantane.data();
      aChaqueEtat({
        uid,
        nom: typeof donnees.nom === 'string' ? donnees.nom : '',
        avatar: typeof donnees.avatar === 'string' ? donnees.avatar : 'encre',
        demandeLeMs: enMillisecondes(donnees.demandeLe),
      });
    },
    () => aChaqueEtat(null),
  );
}

/**
 * Écarte un appel.
 *
 * L'animatrice quand elle a vu et choisi de ne pas ouvrir ; l'appelant
 * lui-même quand il entre. **Rien ne s'archive** : il n'existe aucun état où
 * l'outil garde la trace des retards d'un jeudi.
 */
export async function ecarterAppel(sessionId: string, uid: string): Promise<void> {
  await deleteDoc(doc(baseDeDonnees(), 'sessions', sessionId, 'appels', uid));
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

/**
 * La prochaine séance préparée, quand aucune n'est en cours.
 *
 * **Sans tri côté base, et c'est délibéré.** Un `where` sur le statut suivi
 * d'un `orderBy` sur la date exigerait un index composite de plus ; on lit les
 * quelques séances en attente et on les classe ici. Une animatrice n'en
 * prépare pas trente d'avance.
 *
 * La plus récemment créée l'emporte : le modèle ne porte pas de date de
 * programmation, et la dernière préparée est celle du prochain jeudi.
 */
export async function prochaineSeance(): Promise<Session | null> {
  const instantane = await getDocs(
    query(collection(baseDeDonnees(), 'sessions'), where('statut', '==', 'attente'), limit(10)),
  );

  const seances = instantane.docs
    .map((document) => ({
      seance: lireSession(document.id, document.data()),
      creeeLeMs: enMillisecondes(document.data().creeeLe) ?? 0,
    }))
    .sort((a, b) => b.creeeLeMs - a.creeeLeMs);

  return seances[0]?.seance ?? null;
}

/**
 * Les séances encore à jouer qui contiennent cette question.
 *
 * **Ce qu'elle empêche.** Supprimer une question ne touche pas aux séances :
 * leur `questionIds` garde l'identifiant, et personne n'est prévenu. Le jeudi,
 * la séance arrive sur cette question et affiche « Cette question n'est plus
 * publiée » devant la salle — un trou que Noémie ne peut ni prévoir ni
 * expliquer, parce que rien, au moment de la suppression, ne le lui a dit.
 *
 * **Seules les séances à venir comptent ici.** Une séance terminée ou
 * abandonnée est de l'histoire : son bilan est figé, et la question manquante
 * n'y produira plus rien de neuf. Les trois autres statuts — préparée, en
 * cours, en pause — désignent des séances qui se joueront encore.
 *
 * **Un seul filtre dans la requête, et c'est délibéré.** Croiser
 * `array-contains` et un `in` sur le statut réclamerait un index composite de
 * plus ; l'appartenance suffit à ramener une poignée de documents, et le tri
 * se fait ici. Une question n'entre pas dans trente séances.
 */
export async function seancesAVenirContenant(questionId: string): Promise<Session[]> {
  const instantane = await getDocs(
    query(
      collection(baseDeDonnees(), 'sessions'),
      where('questionIds', 'array-contains', questionId),
      limit(20),
    ),
  );

  const aVenir: StatutSession[] = ['attente', 'encours', 'pause'];
  return instantane.docs
    .map((document) => lireSession(document.id, document.data()))
    .filter((seance) => aVenir.includes(seance.statut));
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
 * Ferme ou rouvre la porte de la salle.
 *
 * **Trois choses que ce geste ne fait pas**, et elles valent d'être dites parce
 * que le mot « verrouiller » les suggère toutes les trois :
 *
 * - il ne met pas la séance en pause — le vote continue ;
 * - il ne sort personne — les marqueurs de présence existants sont intacts,
 *   et les règles ne ferment que la *création* d'un marqueur ;
 * - il ne périme pas le code — celui qui l'a entendu le retapera en vain tant
 *   que la porte est fermée, et il entrera dès qu'elle rouvre.
 *
 * **Le refus se prononce côté serveur.** L'écran d'accès lit la séance avant
 * d'écrire, pour distinguer « code inconnu » de « salle fermée » — deux
 * messages différents —, mais c'est la règle qui interdit, pas l'écran : un
 * onglet resté ouvert sur l'ancien état ne doit pas pouvoir entrer.
 */
export async function verrouillerAcces(sessionId: string, verrouillee: boolean): Promise<void> {
  await updateDoc(doc(baseDeDonnees(), 'sessions', sessionId), { verrouillee });
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
 * **Deux sorts distincts, et les confondre serait une faute.**
 *
 * *Les réponses de la séance* — `sessions/{id}/reponses` — **sont effacées**.
 * Elles ne servaient qu'au classement, il n'y en aura pas, et une séance
 * abandonnée ne laisse rien de nominatif derrière elle. L'effacement est fait
 * par la Cloud Function du bilan, **dans le même lot que le bilan** : ou les
 * deux ont lieu, ou aucune. Le bilan, lui, est anonyme et survit — c'est ce qui
 * permet de préparer la séance suivante.
 *
 * *La progression de chacun* — `users/{uid}/reponses` et `users/{uid}/etats` —
 * **ne bouge pas**. Ces réponses étaient réelles : elles comptent dans les
 * questions à revoir comme n'importe quelle réponse d'entraînement. C'est la
 * décision du lot 7, et l'écran du participant la promet en toutes lettres. On
 * ne pourrait d'ailleurs pas l'annuler proprement : les compteurs d'`etats` ne
 * redescendent pas, et `questionStats` a déjà agrégé.
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

/**
 * Modifie une séance préparée.
 *
 * **« Reprendre » de la liste des séances prêtes.** Jusqu'ici une séance
 * composée ne se corrigeait pas : on la supprimait et on recommençait. Elle
 * reste pourtant modifiable jusqu'au lancement, et l'écran le promet en toutes
 * lettres.
 *
 * Réservé à une séance en attente : les règles laisseraient passer une
 * modification sur une séance ouverte, mais changer les questions sous les
 * pieds d'une salle qui vote n'est pas une correction, c'est un incident.
 */
export async function modifierSeance(
  sessionId: string,
  questionIds: string[],
  dureeQuestionSecondes: number,
  annonce: { titre: string; description: string; effectifAttendu?: number },
): Promise<void> {
  await updateDoc(doc(baseDeDonnees(), 'sessions', sessionId), {
    questionIds,
    dureeQuestionSecondes,
    titre: titreAffichable(annonce.titre),
    description: descriptionAffichable(annonce.description),
    effectifAttendu: Math.max(0, Math.trunc(annonce.effectifAttendu ?? 0)),
    // La séance n'a pas commencé : l'index reste au départ quoi qu'il arrive.
    indexCourant: 0,
  });
}

/**
 * Compose et ouvre la salle dans la foulée.
 *
 * **Un seul chemin de lancement, et c'est le point de cette fonction.** La
 * composition offre désormais « Lancer la séance » en plus d'« Enregistrer et
 * fermer ». Écrire directement une séance `encours` aurait produit un second
 * chemin d'ouverture, qui aurait divergé du premier à la première évolution —
 * un champ posé ici et pas là, et la salle d'attente s'ouvre sans heure
 * d'ouverture.
 *
 * On compose donc une séance en attente, puis on appelle `lancerSeance`,
 * exactement comme le bouton « Lancer » de la liste. Deux écritures au lieu
 * d'une, pour que l'ouverture n'ait qu'une définition.
 */
export async function preparerEtLancer(
  animateurUid: string,
  questionIds: string[],
  dureeQuestionSecondes: number,
  annonce: {
    titre: string;
    description: string;
    animateurNom: string;
    effectifAttendu?: number;
  },
): Promise<string> {
  const sessionId = await creerSession(
    animateurUid,
    questionIds,
    dureeQuestionSecondes,
    'attente',
    annonce,
  );
  await lancerSeance(sessionId);
  return sessionId;
}

/**
 * Ouvre la salle. La séance devient rejoignable, elle ne commence pas.
 *
 * **`ouverteLe` est posé ici, et nulle part ailleurs.** C'est la date qu'annonce
 * l'écran d'accès — « Ouverte jeudi à 14 h 05 » — et une séance composée le
 * mardi porterait sinon la date de sa composition.
 *
 * `demarree` reste faux : la première question se pousse depuis la salle
 * d'attente, avec `demarrer()`. `questionOuverteLe` est tout de même reposé ici,
 * parce que les règles l'exigent au passage en `encours` — mais il sera reposé
 * une seconde fois au démarrage, et c'est celui-là qui cadence la salle.
 */
export async function lancerSeance(sessionId: string): Promise<void> {
  await updateDoc(doc(baseDeDonnees(), 'sessions', sessionId), {
    statut: 'encours',
    ouverteLe: serverTimestamp(),
    questionOuverteLe: serverTimestamp(),
  });
}

/**
 * Pousse la première question. C'est la fin de la salle d'attente.
 *
 * **Distinct de `lancerSeance`, et les deux gestes sont distincts pour de
 * bon.** Lancer ouvre la salle : le code devient valable, les présents
 * arrivent, l'écran projeté les affiche. Démarrer pose la première question
 * devant tout le monde. Entre les deux il se passe deux minutes pendant
 * lesquelles Noémie dicte le code et attend les retardataires — c'est
 * exactement ce que la salle d'attente sert à tenir.
 *
 * **Le chronomètre part ici**, pas à l'ouverture de la salle : sinon la
 * première question arriverait avec un décompte déjà entamé du temps qu'il a
 * fallu pour remplir la pièce.
 */
export async function demarrer(sessionId: string): Promise<void> {
  await updateDoc(doc(baseDeDonnees(), 'sessions', sessionId), {
    demarree: true,
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
      /* Servie ou non : une question marquée à relire se pose comme les
         autres, un brouillon ne se pose pas. */
      aChaqueEtat(estServie(question.statut) ? question : null);
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
