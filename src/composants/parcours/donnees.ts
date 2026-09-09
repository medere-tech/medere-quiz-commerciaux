'use client';

import { useEffect, useState } from 'react';

import { authentification } from '@/lib/firebase/client';
import { echecDeLecture, type EchecDeLecture } from '@/lib/firebase/erreurs';
import type { Formation } from '@/lib/formations/lecture';
import type { Question } from '@/lib/questions/lecture';
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

/** Ce que le serveur a déjà lu et transmis. */
export type Referentiel = {
  questions: Question[];
  formations: Formation[];
};

export type DonneesParcours = {
  uid: string;
  questions: Question[];
  formations: Formation[];
  progression: Progression;
  etats: EtatComplet[];
};

export type EtatChargement =
  | { etat: 'chargement' }
  | { etat: 'anonyme' }
  | { etat: 'erreur'; echec: EchecDeLecture }
  | { etat: 'pret'; donnees: DonneesParcours };

export function useDonneesParcours(referentiel: Referentiel): EtatChargement {
  const [resultat, setResultat] = useState<EtatChargement>({ etat: 'chargement' });

  useEffect(() => {
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
  }, [referentiel]);

  return resultat;
}
