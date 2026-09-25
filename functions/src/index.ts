import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger, setGlobalOptions } from 'firebase-functions/v2';

import { agreger, estAdministrateur, lireReponse } from './agregation.js';
import { bilanDesReponses, classer, type ReponseSeance } from './classement.js';
import { calculerClassement, nomPubliable, type Regularite } from './podium.js';
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

    /*
     * Ce que la séance laisse d'elle-même, sur son propre document.
     *
     * **Pourquoi ici et pas dans un second déclencheur.** C'est la même
     * transition — `encours` vers close — et deux déclencheurs sur le même
     * événement, c'est une course : celui qui écrirait le second pourrait
     * partir avant que le premier ait fini, et l'un des deux documents
     * manquerait sans que rien ne le signale.
     *
     * **Pourquoi sur la séance et pas seulement dans le bilan.** La liste des
     * séances passées affiche la date, la durée et le nombre de présents pour
     * chaque ligne. Les lire dans le bilan coûterait une lecture par séance
     * affichée ; sur le document de séance, elles arrivent avec la liste,
     * qui est déjà chargée.
     *
     * `presentsFinal` fige le compte : la liste nominative des participants
     * s'éteint avec la séance pour tout le monde sauf l'animatrice, et un
     * nombre n'est pas une liste.
     */
    lot.update(session, {
      termineeLe: new Date(),
      presentsFinal: identites.size,
    });

    /*
     * **Une séance abandonnée efface ses réponses.**
     *
     * Elles ne servaient qu'au classement, et il n'y en aura pas. Elles sont
     * déjà invisibles de tous une fois la séance close — la règle `list` est
     * conditionnée à `encours` ou `pause` — mais invisible n'est pas effacé, et
     * une séance qu'on abandonne ne doit rien laisser de nominatif derrière
     * elle.
     *
     * **Uniquement à l'abandon, jamais à une fin normale.** Une séance terminée
     * garde ses réponses : le classement s'écrit juste en dessous, et l'on ne
     * retire pas le sol sous ses propres pieds.
     *
     * **La progression individuelle, elle, ne bouge pas.** `users/{uid}/reponses`
     * et `users/{uid}/etats` restent intacts : ces réponses étaient réelles,
     * elles comptent dans la progression de chacun et dans les questions à
     * revoir. C'est la décision du lot 7, et l'écran du participant la promet en
     * toutes lettres. On ne pourrait d'ailleurs pas l'annuler proprement — les
     * compteurs d'états ne redescendent pas, et `questionStats` a déjà agrégé.
     *
     * **L'ordre compte, et le lot le garantit.** Le bilan est calculé depuis
     * `lues`, déjà en mémoire, et écrit dans le même lot que ces suppressions :
     * ou les deux ont lieu, ou aucune. Il n'existe aucune fenêtre où les
     * réponses seraient parties sans que le bilan soit écrit. Le bilan est
     * anonyme — deux compteurs par question —, il survit donc sans rien porter
     * de nominatif.
     */
    if (!classe) {
      for (const document of reponses.docs) lot.delete(document.ref);
    }

    const rangs = classe ? classer(lues, identites) : [];

    if (rangs.length === 0) {
      await lot.commit();
      logger.info('Séance close sans classement', {
        classe,
        reponses: lues.length,
        reponsesEffacees: classe ? 0 : reponses.size,
      });
      return;
    }

    lot.set(session.collection('classement').doc('final'), {
      rangs,
      etabliLe: new Date(),
    });

    /*
     * Le jour où le prix est posé, au format des récompenses : `AAAA-MM-JJ`
     * en heure de Paris, comme partout ailleurs dans l'assiduité.
     */
    const jour = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

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

    /*
     * **« Première séance collective », dans le même lot que les prix.**
     *
     * C'est la seule récompense que l'accueil ne peut pas juger : il ne sait
     * pas qu'on a participé à une séance sans lire les réponses de séance, qui
     * ne lui appartiennent pas. Elle s'accorde donc là où le fait est constaté,
     * et **sans second déclencheur** — deux fonctions sur le même évènement
     * seraient une course.
     *
     * **On relit avant d'écrire, et c'est le point.** `mergeFields` écrase la
     * valeur si la clé existe déjà : « première séance » afficherait alors la
     * date de la *dernière*. Le SDK Admin passe outre les règles, mais il doit
     * respecter la garantie qu'elles posent — une récompense ne se réécrit pas.
     * Le coût est d'une lecture par participant classé, une fois par séance.
     */
    const porteurs = await base.getAll(
      ...rangs.map((rang) => base.collection('users').doc(rang.uid)),
    );

    for (const porteur of porteurs) {
      const carte = porteur.get('recompenses') as Record<string, unknown> | undefined;
      if (carte && typeof carte['premiere-seance'] === 'string') continue;

      lot.set(
        porteur.ref,
        { recompenses: { 'premiere-seance': jour } },
        { mergeFields: ['recompenses.premiere-seance'] },
      );
    }

    await lot.commit();
    logger.info('Séance close', { classement: rangs.length, questions: questionIds.length });
  },
);

/**
 * Le podium de régularité, recalculé quand une assiduité bouge.
 *
 * **C'est le seul écran de l'outil où l'on voit le nom de quelqu'un d'autre
 * hors d'une séance vécue ensemble**, et chaque contrainte qui suit est là
 * pour que ça reste tenable.
 *
 * **Ce qui est lu et ce qui est publié.** La fonction lit `assiduite`, `nom`
 * et `avatar` de chaque commercial — rien d'autre, et surtout aucun taux de
 * maîtrise, qui ne sort jamais de `users/{uid}`. Elle publie deux documents :
 * le podium, lisible par le domaine, qui ne contient que les nommés ; et le
 * rang de chacun, dans un document que lui seul lit.
 *
 * **Le déclencheur, et pourquoi pas un programmateur.** La régularité change
 * quand quelqu'un termine une série, c'est-à-dire quand `assiduite` change.
 * Un Cloud Scheduler rattraperait en plus les séries qui se périment sans
 * écriture — mais une semaine où personne ne joue est une semaine où personne
 * ne regarde, et l'infrastructure ne vaut pas ce cas. Le classement se fait
 * donc sur la série **du jour**, et le client la recalcule à la lecture : un
 * nombre périmé vers le haut serait pire que pas de podium.
 *
 * **On ne se redéclenche pas soi-même** : la fonction n'écrit que sous
 * `classements/`, jamais sous `users/`.
 */
export const publierPodiumRegularite = onDocumentUpdated('users/{uid}', async (evenement) => {
  const avant = evenement.data?.before.data();
  const apres = evenement.data?.after.data();
  if (!apres) return;

  /*
   * **Une écriture sur `users/{uid}` ne veut pas dire qu'une série a bougé.**
   * Le document porte aussi le nom de séance, la couleur, les étoiles, la
   * dernière visite. Recalculer à chaque fois ferait dix lectures pour rien,
   * plusieurs fois par minute, et sur un document que tout le monde touche.
   */
  const serieAvant = JSON.stringify(avant?.assiduite ?? null);
  const serieApres = JSON.stringify(apres.assiduite ?? null);
  const identiteChangee = avant?.nomSession !== apres.nomSession || avant?.avatar !== apres.avatar;
  if (serieAvant === serieApres && !identiteChangee) return;

  const base = getFirestore();
  const tous = await base.collection('users').get();

  const equipe: Regularite[] = tous.docs.flatMap((document) => {
    const donnees = document.data();
    const assiduite = donnees.assiduite as { serie?: unknown; dernierJour?: unknown } | undefined;
    const nom = nomPubliable(donnees);
    if (nom === '') return [];

    return [
      {
        uid: document.id,
        nom,
        avatar: typeof donnees.avatar === 'string' ? donnees.avatar : 'encre',
        serie: typeof assiduite?.serie === 'number' ? assiduite.serie : 0,
        dernierJour: typeof assiduite?.dernierJour === 'string' ? assiduite.dernierJour : '',
      },
    ];
  });

  const { podium, rangs } = calculerClassement(equipe, clefDuJourParis(new Date()));

  const racine = base.collection('classements').doc('regularite');
  const lot = base.batch();

  lot.set(racine, {
    lignes: podium.lignes,
    autresAuDernierRang: podium.autresAuDernierRang,
    calculeLe: FieldValue.serverTimestamp(),
  });

  /*
   * **Les rangs périmés partent avec.** Quelqu'un dont la série s'éteint sort
   * du classement : laisser son document dirait « vous êtes 7e » à quelqu'un
   * qui n'a plus de rang, et l'écran le croirait.
   */
  const anciens = await racine.collection('personnel').get();
  const vivants = new Set(rangs.map((rang) => rang.uid));
  for (const ancien of anciens.docs) {
    if (!vivants.has(ancien.id)) lot.delete(ancien.ref);
  }

  for (const rang of rangs) {
    lot.set(racine.collection('personnel').doc(rang.uid), {
      rang: rang.rang,
      ecart: rang.ecart,
    });
  }

  await lot.commit();
  logger.info('Podium de régularité publié', {
    nommes: podium.lignes.length,
    classes: rangs.length,
  });
});

/**
 * La clé du jour à Paris, en `AAAA-MM-JJ`.
 *
 * Copie assumée de `src/lib/serie/assiduite.ts` : `functions/` est un paquet à
 * part, sans accès à `src/`. La frontière du jour est celle de Paris, pas
 * celle d'UTC — une série terminée à 23 h 30 en hiver appartient au jour
 * civil français.
 */
function clefDuJourParis(instant: Date): string {
  const parties = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const lire = (type: string) => parties.find((partie) => partie.type === type)?.value ?? '';
  return `${lire('year')}-${lire('month')}-${lire('day')}`;
}
