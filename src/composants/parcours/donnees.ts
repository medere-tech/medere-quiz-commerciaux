'use client';

import { useEffect, useState } from 'react';

import { authentification } from '@/lib/firebase/client';
import { echecDeLecture, type EchecDeLecture } from '@/lib/firebase/erreurs';
import { chargerFormations, type Formation } from '@/lib/formations/depot';
import type { Question } from '@/lib/questions/depot';
import {
  chargerMesReponses,
  chargerProgression,
  chargerQuestionsPubliees,
  historiques,
  type Progression,
  type Reponse,
} from '@/lib/serie/depot';
import type { EtatQuestion } from '@/lib/serie/tirage';

/**
 * Ce que le parcours a besoin de savoir, chargé d'un bloc.
 *
 * Les trois lectures partent ensemble : elles ne dépendent pas les unes des
 * autres, et les enchaîner tripleraient l'attente avant le premier écran. Une
 * seule d'entre elles qui échoue fait échouer l'ensemble — sans les questions
 * ou sans l'historique, il n'y a pas de série à tirer, et un écran à moitié
 * chargé mentirait sur la maîtrise.
 */

export type DonneesParcours = {
  uid: string;
  questions: Question[];
  formations: Formation[];
  reponses: Reponse[];
  progression: Progression;
  etats: EtatQuestion[];
};

export type EtatChargement =
  | { etat: 'chargement' }
  | { etat: 'anonyme' }
  | { etat: 'erreur'; echec: EchecDeLecture }
  | { etat: 'pret'; donnees: DonneesParcours };

export function useDonneesParcours(): EtatChargement {
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
        const [questions, formations, reponses, progression] = await Promise.all([
          chargerQuestionsPubliees(),
          chargerFormations(),
          chargerMesReponses(utilisateur.uid),
          chargerProgression(utilisateur.uid),
        ]);

        if (!vivant) return;

        setResultat({
          etat: 'pret',
          donnees: {
            uid: utilisateur.uid,
            questions,
            formations,
            reponses,
            progression,
            etats: historiques(
              questions.map((question) => question.id),
              reponses,
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
  }, []);

  return resultat;
}
