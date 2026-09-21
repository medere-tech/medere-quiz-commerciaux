'use client';

import { useEffect, useState } from 'react';

import { authentification } from '@/lib/firebase/client';
import { echecDeLecture, type EchecDeLecture } from '@/lib/firebase/erreurs';
import type { Formation } from '@/lib/formations/lecture';
import type { QuestionListee } from '@/lib/questions/lecture';
import {
  chargerMesEtats,
  chargerProgression,
  etatsDesQuestions,
  type EtatComplet,
  type Progression,
} from '@/lib/serie/depot';


/**
 * Ce que le parcours a besoin de savoir, chargé d'un bloc.
 *
 * **Le référentiel arrive déjà rendu.** Questions publiées et formations sont
 * lues au serveur et passées en propriétés : elles n'attendent donc ni le
 * jeton App Check ni l'ouverture d'une connexion Firestore. Ne restent ici que
 * les deux lectures privées — états et progression — que les règles protègent
 * et qui doivent donc passer par le SDK client.
 *
 * Les deux partent ensemble : elles ne dépendent pas l'une de l'autre, et les
 * enchaîner doublerait l'attente. Une seule qui échoue fait échouer
 * l'ensemble — un écran à moitié chargé mentirait sur la maîtrise.
 *
 * **L'historique se lit résumé, pas déroulé.** `users/{uid}/etats` porte une
 * ligne par question rencontrée ; `users/{uid}/reponses` en porte une par
 * tentative. À dix réponses par jour, la seconde collection dépasse le millier
 * en quelques mois, pour un résultat qui tient dans la première. Les réponses
 * restent écrites — elles sont la source de vérité — mais le parcours ne les
 * lit plus.
 */

/**
 * Ce que le serveur a déjà lu et transmis.
 *
 * **Le paramètre de type porte le choix fait par l'écran.** La plupart
 * reçoivent des questions de liste — assez pour compter, filtrer, afficher un
 * titre. La série reçoit des questions complètes, parce qu'elle les pose. Le
 * crochet est le même pour les deux : il ne touche ni au contenu ni à son
 * absence, il ajoute la progression et les états.
 */
export type Referentiel<Q extends QuestionListee = QuestionListee> = {
  questions: Q[];
  formations: Formation[];
};

export type DonneesParcours<Q extends QuestionListee = QuestionListee> = {
  uid: string;
  questions: Q[];
  formations: Formation[];
  progression: Progression;
  etats: EtatComplet[];
};

export type EtatChargement<Q extends QuestionListee = QuestionListee> =
  | { etat: 'chargement' }
  | { etat: 'anonyme' }
  | { etat: 'erreur'; echec: EchecDeLecture }
  | { etat: 'pret'; donnees: DonneesParcours<Q> };

/**
 * Ce que le serveur a déjà lu des données privées, quand il l'a fait.
 *
 * **Mesuré :** par le navigateur, la donnée arrivait à l'écran au bout de huit
 * secondes et demie — scripts, puis attestation App Check, puis poignée de main
 * du canal Firestore, en file. Le serveur n'attend rien de tout cela : il lit
 * avec le SDK Admin pendant qu'il rend le HTML, et la donnée part avec.
 *
 * Voir `src/lib/serveur/donnees-privees.ts` pour la décision et ce qu'elle
 * coûte, et le README pour les deux chiffres.
 */
export type ParcoursSeme = {
  uid: string;
  etats: EtatComplet[];
  progression: Progression;
};

export function useDonneesParcours<Q extends QuestionListee>(
  referentiel: Referentiel<Q>,
  seme?: ParcoursSeme,
): EtatChargement<Q> {
  /*
   * **Quand le serveur a semé, il n'y a rien à charger.** L'état de départ est
   * déjà `pret` : aucun squelette, aucun effet, aucune lecture. Le crochet
   * garde son second chemin — le client — pour les écrans qui n'ont pas encore
   * été semés, et pour qu'un rechargement de données reste possible.
   */
  const [resultat, setResultat] = useState<EtatChargement<Q>>(() =>
    seme
      ? {
          etat: 'pret',
          donnees: {
            uid: seme.uid,
            questions: referentiel.questions,
            formations: referentiel.formations,
            progression: seme.progression,
            etats: seme.etats,
          },
        }
      : { etat: 'chargement' },
  );

  useEffect(() => {
    if (seme) return;
    let vivant = true;

    async function charger() {
      const utilisateur = authentification().currentUser;
      if (!utilisateur) {
        if (vivant) setResultat({ etat: 'anonyme' });
        return;
      }

      try {
        const [etats, progression] = await Promise.all([
          chargerMesEtats(utilisateur.uid),
          chargerProgression(utilisateur.uid),
        ]);

        if (!vivant) return;

        setResultat({
          etat: 'pret',
          donnees: {
            uid: utilisateur.uid,
            questions: referentiel.questions,
            formations: referentiel.formations,
            progression,
            etats: etatsDesQuestions(
              referentiel.questions.map((question) => question.id),
              etats,
            ),
          },
        });
      } catch (probleme) {
        if (vivant) {
          setResultat({ etat: 'erreur', echec: echecDeLecture(probleme, 'votre entraînement') });
        }
      }
    }

    void charger();
    return () => {
      vivant = false;
    };
    // `seme` est lu au premier rendu et ne change pas : l'inclure ferait
    // relancer l'effet à chaque nouvelle identité d'objet, pour rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referentiel]);

  return resultat;
}
