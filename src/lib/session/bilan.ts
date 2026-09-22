/**
 * Ce qu'un bilan de séance dit, une fois recroisé avec le référentiel.
 *
 * **Module pur, sans React ni Firestore.** Ces deux fonctions décident ce que
 * l'animatrice lit d'une séance passée : ce qui a trébuché, et à quel point.
 * Les laisser dans le composant les rendait invérifiables sans monter un
 * navigateur — et c'est un test qui l'a signalé, en refusant de charger la
 * configuration Firebase pour calculer un pourcentage.
 *
 * **Le bilan est anonyme, et c'est tout ce qui reste.** Deux compteurs par
 * question, aucun identifiant : la liste nominative s'éteint avec la séance.
 */

import type { Formation } from '@/lib/formations/depot';
import type { QuestionListee } from '@/lib/questions/lecture';
import { LIBELLES_TYPE } from '@/lib/questions/modele';
import type { LigneBilan } from '@/lib/session/depot';

/** Ce qu'une ligne du bilan devient une fois recroisée avec sa question. */
export type LigneTrebuchee = {
  questionId: string;
  enonce: string;
  type: string;
  formation: Formation | null;
  tauxEchec: number;
};

/**
 * Croise le bilan et le référentiel, du plus raté au moins raté.
 *
 * **Une question sans réponse n'a pas de taux d'échec**, et lui en inventer un
 * de zéro la ferait passer pour une question parfaitement réussie. Elle sort
 * de la liste : l'écran dit ce qui a trébuché, pas ce qui n'a pas été joué.
 */
export function lignesTrebuchees(
  bilan: LigneBilan[],
  questions: QuestionListee[],
  formations: Formation[],
): LigneTrebuchee[] {
  const parId = new Map(questions.map((question) => [question.id, question]));
  const formationsParId = new Map(formations.map((formation) => [formation.id, formation]));

  return bilan
    .filter((ligne) => ligne.reponses > 0)
    .map((ligne) => {
      const question = parId.get(ligne.questionId);
      const formationId = question?.formationIds[0];
      return {
        questionId: ligne.questionId,
        enonce: question?.enonce ?? 'Question retirée de la banque',
        type: question ? LIBELLES_TYPE[question.type] : '',
        formation: formationId ? (formationsParId.get(formationId) ?? null) : null,
        tauxEchec: Math.round((ligne.echecs / ligne.reponses) * 100),
      };
    })
    .sort((gauche, droite) => droite.tauxEchec - gauche.tauxEchec);
}

/** Le taux d'échec moyen de la séance, pondéré par le nombre de réponses. */
export function echecMoyen(bilan: LigneBilan[]): number | null {
  const reponses = bilan.reduce((total, ligne) => total + ligne.reponses, 0);
  if (reponses === 0) return null;

  const echecs = bilan.reduce((total, ligne) => total + ligne.echecs, 0);
  return Math.round((echecs / reponses) * 100);
}

/**
 * Au-delà, une question a « trébuché ».
 *
 * C'est le seuil que la maquette colore en rouge, et c'est aussi celui que
 * « reprendre les ratées » retient. **Les deux doivent être le même nombre** :
 * proposer de reprendre une liste différente de celle qu'on montre en rouge
 * serait le genre d'écart que personne ne remarque avant la séance suivante.
 */
export const SEUIL_GRAVE = 50;
