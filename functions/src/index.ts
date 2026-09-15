import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger, setGlobalOptions } from 'firebase-functions/v2';

import { agreger, estAdministrateur, lireReponse } from './agregation.js';
import { bilanDesReponses, classer, type ReponseSeance } from './classement.js';
import { compterReponse } from './session.js';

/**
 * Agrégation des réponses vers `questionStats`.
 *
 * **Un seul chemin d'agrégation, et le lot 6 s'était trompé sur ce point.** Il
 * annonçait ici un second déclencheur, sur
 * `sessions/{sessionId}/reponses/{uid_questionId}`, pour faire entrer les
 * réponses de session dans `questionStats`. C'était une erreur, découverte au
 * lot 7 : une réponse donnée en session doit aussi alimenter la progression
 * individuelle et la file des questions à revoir, donc le participant écrit
 * **deux documents dans un même lot atomique** — un sous `sessions/`, pour que
 * l'animatrice voie les votes en direct, un sous `users/{uid}/reponses`, pour
 * sa propre progression.
 *
 * Deux documents dans deux collections surveillées, ce sont deux événements
 * Cloud Functions distincts, donc deux identifiants d'événement différents :
 * **le dédoublonnage ne les rattrape pas**, et chaque réponse de session
 * compterait double. Le déclencheur ci-dessous, sur `users/{uid}/reponses`,
 * suffit à lui seul : il voit les deux origines, puisque les deux passent par
 * là.
 *
 * Il existe bien un second déclencheur sur les réponses de session, plus bas,
 * mais il ne touche pas à `questionStats` — il tient le compteur de réponses
 * affiché pendant la séance. Voir `session.ts`.
 *
 * **Reprise sur erreur.** `retry` reste à sa valeur par défaut, c'est-à-dire
 * désactivé : une erreur permanente relancée pendant vingt-quatre heures
 * coûterait plus qu'une statistique amputée d'une réponse. Mais Cloud
 * Functions garantit une livraison *au moins une fois* même sans reprise, si
 * bien qu'un doublon reste possible — d'où le dédoublonnage par identifiant
 * d'événement dans `agreger`.
 */

initializeApp();

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

export const agregerReponseEntrainement = onDocumentCreated(
  'users/{uid}/reponses/{reponseId}',
  async (evenement) => {
    const reponse = lireReponse(evenement.data?.data());

    if (!reponse) {
      // Les règles valident déjà la forme d'une réponse. Si l'on arrive ici,
      // c'est une écriture par le SDK Admin, hors règles : on la signale sans
      // faire échouer la fonction, qui n'a rien à réparer.
      logger.warn('Réponse illisible, agrégation ignorée', {
        chemin: evenement.data?.ref.path,
      });
      return;
    }

    // Les essais de l'équipe pédagogique ne comptent pas.
    //
    // Noémie parcourt le quiz pour relire ses propres explications en
    // situation : ses réponses sont justes par construction et fausseraient à
    // la baisse le taux d'échec des questions qu'elle inspecte. Le rôle est lu
    // sur le custom claim, seule source qui fasse autorité — un marqueur posé
    // par le navigateur laisserait n'importe qui se retirer de l'agrégat.
    //
    // **Rien n'est attrapé ici.** Si l'Auth ne répond pas, on ne sait pas qui
    // a répondu : l'erreur remonte, elle apparaît dans les journaux, et cette
    // réponse-là n'est pas agrégée. La traiter comme « pas administrateur »
    // rendrait une panne d'Auth invisible, exactement le défaut que ce projet
    // s'interdit.
    const utilisateur = await getAuth().getUser(evenement.params.uid);

    if (estAdministrateur(utilisateur.customClaims)) {
      // Aucun identifiant dans ce journal : le rôle suffit à expliquer.
      logger.info('Réponse d’un compte administrateur, tenue hors de l’agrégat');
      return;
    }

    // `evenement.params.uid` a servi à décider, il n'est jamais transmis :
    // l'agrégat ne doit porter aucun identifiant d'utilisateur.
    const resultat = await agreger(getFirestore(), {
      questionId: reponse.questionId,
      correcte: reponse.correcte,
      evenementId: evenement.id,
    });

    if (resultat === 'doublon') {
      logger.info('Événement déjà agrégé, ignoré', { evenementId: evenement.id });
    }
  },
);

/**
 * Compteur de réponses d'une session collective.
 *
 * Il ne fait qu'une chose : tenir à jour `repondants` sur le document de
 * session, pour que chaque participant voie le nombre monter sans avoir le
 * droit de lire les réponses des autres. Le raisonnement complet est dans
 * `session.ts` ; l'essentiel tient en une phrase : **ce déclencheur n'agrège
 * rien**, sous peine de compter chaque réponse deux fois.
 */
export const compterReponseSession = onDocumentCreated(
  'sessions/{sessionId}/reponses/{reponseId}',
  async (evenement) => {
    const reponse = lireReponse(evenement.data?.data());

    if (!reponse) {
      logger.warn('Réponse de session illisible, compteur inchangé', {
        chemin: evenement.data?.ref.path,
      });
      return;
    }

    const resultat = await compterReponse(
      getFirestore(),
      evenement.params.sessionId,
      reponse.questionId,
    );

    if (resultat === 'ignore') {
      // Arrivée après la révélation ou après le passage à la question
      // suivante : la compter fausserait le nombre affiché.
      logger.info('Réponse hors de la question ouverte, non comptée');
    }
  },
);

/**
 * Classement de fin de séance, et prix qui en découlent.
 *
 * **Pourquoi c'est le serveur qui compte.** Ni le participant ni l'animatrice
 * n'écrivent ces documents : `users/{uid}/prix` est fermé en écriture à tout
 * client, propriétaire compris. Un prix qu'on peut s'attribuer ne vaut rien, et
 * un classement écrit par l'un des concurrents non plus.
 *
 * **Le tableau meurt avec la séance, le trophée reste.** Le classement est posé
 * sous la séance, lisible par ceux qui y étaient — les règles vérifient la
 * présence. Le prix est posé sous chaque participant, lisible par lui seul.
 * Rien n'entre dans `questionStats` : les statistiques disent quelles questions
 * font trébucher l'équipe, jamais qui a gagné.
 *
 * **Un rang pour tout le monde, une distinction pour trois.** Le quatrième et
 * les suivants reçoivent aussi leur document : leur rang est privé, c'est leur
 * trace de la séance, et personne d'autre ne le voit.
 */
export const classerSessionTerminee = onDocumentUpdated(
  'sessions/{sessionId}',
  async (evenement) => {
    const avant = evenement.data?.before.data();
    const apres = evenement.data?.after.data();

    const closes = ['terminee', 'abandonnee'];
    const seFerme =
      Boolean(apres) &&
      closes.includes(String(apres?.statut)) &&
      !closes.includes(String(avant?.statut));

    // On n'agit qu'au passage, pas à chaque écriture sur une séance close.
    if (!apres || !seFerme) return;

    /*
     * Une séance abandonnée n'est pas classée — le résultat ne voudrait rien
     * dire — mais son bilan est écrit quand même : ce qui a été posé et ce qui
     * a trébuché reste utile pour préparer la suivante, et c'est anonyme.
     */
    const classe = apres.statut === 'terminee';

    const base = getFirestore();
    const sessionId = evenement.params.sessionId;
    const session = base.collection('sessions').doc(sessionId);

    const [reponses, participants] = await Promise.all([
      session.collection('reponses').get(),
      session.collection('participants').get(),
    ]);

    const identites = new Map<string, { nom: string; avatar: string }>();
    for (const document of participants.docs) {
      const { nom, avatar } = document.data();
      if (typeof nom !== 'string' || nom.trim() === '') continue;
      identites.set(document.id, {
        nom,
        avatar: typeof avatar === 'string' ? avatar : 'encre',
      });
    }

    const lues: ReponseSeance[] = reponses.docs.flatMap((document) => {
      const donnees = document.data();
      if (typeof donnees.uid !== 'string' || typeof donnees.correcte !== 'boolean') return [];
      return [
        {
          uid: donnees.uid,
          questionId: typeof donnees.questionId === 'string' ? donnees.questionId : '',
          correcte: donnees.correcte,
          // `repondueLe` sert à départager les égalités : sans lui, l'ordre
          // deviendrait celui des uid, ce qui n'a aucun sens pour un podium.
          repondueLe: donnees.repondueLe?.toMillis?.() ?? 0,
        },
      ];
    });

    const questionIds = Array.isArray(apres.questionIds) ? (apres.questionIds as string[]) : [];
    const lot = base.batch();
    const code = typeof apres.code === 'string' ? apres.code : '';

    // Le bilan existe dès qu'il y a des questions, même sans une seule réponse :
    // « personne n'a répondu » est une information, et l'absence de document
    // ressemblerait à une panne.
    lot.set(session.collection('bilan').doc('final'), {
      questions: bilanDesReponses(lues, questionIds),
      participants: identites.size,
      etabliLe: new Date(),
    });

    const rangs = classe ? classer(lues, identites) : [];

    if (rangs.length === 0) {
      await lot.commit();
      logger.info('Séance close sans classement', { classe, reponses: lues.length });
      return;
    }

    lot.set(session.collection('classement').doc('final'), {
      rangs,
      etabliLe: new Date(),
    });

    for (const rang of rangs) {
      lot.set(base.collection('users').doc(rang.uid).collection('prix').doc(sessionId), {
        codeSession: code,
        distinction: rang.distinction,
        rang: rang.rang,
        justes: rang.justes,
        participants: rangs.length,
        obtenuLe: new Date(),
      });
    }

    await lot.commit();
    logger.info('Séance close', { classement: rangs.length, questions: questionIds.length });
  },
);
