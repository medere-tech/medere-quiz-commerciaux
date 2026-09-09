import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger, setGlobalOptions } from 'firebase-functions/v2';

import { agreger, estAdministrateur, lireReponse } from './agregation.js';

/**
 * Agrégation des réponses vers `questionStats`.
 *
 * **Deux sources, une seule agrégation.** Les réponses d'entraînement vivent
 * sous `users/{uid}/reponses`. Celles de la session collective vivront
 * ailleurs, sous `sessions/{sessionId}/reponses/{uid_questionId}` — c'est le
 * lot 7. La logique d'agrégation est donc isolée dans `agregation.ts` et ne
 * connaît ni l'un ni l'autre chemin : elle reçoit un identifiant de question,
 * un verdict et un identifiant d'événement. Brancher la session revient à
 * ajouter un second déclencheur ci-dessous et rien d'autre. **Ce déclencheur
 * n'est pas écrit ici** : le lot 7 n'existe pas, et une fonction déployée qui
 * écoute une collection vide est une fonction qu'on oublie de relire.
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
