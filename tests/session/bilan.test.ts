import { describe, expect, it } from 'vitest';

import { echecMoyen, lignesTrebuchees } from '@/lib/session/bilan';
import type { Formation } from '@/lib/formations/depot';
import type { QuestionListee } from '@/lib/questions/lecture';
import type { LigneBilan } from '@/lib/session/depot';

/**
 * Ce qu'une séance passée a laissé, lu depuis le bilan.
 *
 * **Le bilan est anonyme, et c'est tout ce qu'il reste.** Deux compteurs par
 * question, aucun identifiant : la liste nominative des réponses s'éteint avec
 * la séance. Ces fonctions ne font donc que croiser ces compteurs avec le
 * référentiel — et la seule façon de les rendre faux est de traiter une
 * absence comme un zéro.
 */

function question(id: string, enonce: string, formationId: string): QuestionListee {
  return {
    id,
    type: 'qcm',
    enonce,
    formationIds: [formationId],
    theme: 'reglementaire',
    difficulte: 1,
    statut: 'publiee',
    creeePar: 'uid-noemie',
    creeeLe: null,
    modifieeLe: null,
  } as QuestionListee;
}

const QUESTIONS = [
  question('q1', 'Durée minimale d’un e-learning', 'f1'),
  question('q2', 'Le présentiel se réserve la veille', 'f1'),
  question('q3', 'Publics accrédités', 'f1'),
];

const FORMATIONS: Formation[] = [
  { id: 'f1', nom: 'Formats et modalités', cibles: ['Chirurgien dentiste'] } as Formation,
];

function ligne(questionId: string, reponses: number, echecs: number): LigneBilan {
  return { questionId, reponses, echecs };
}

describe('lignesTrebuchees', () => {
  it('classe du plus raté au moins raté', () => {
    const lignes = lignesTrebuchees(
      [ligne('q1', 10, 2), ligne('q2', 10, 9), ligne('q3', 10, 5)],
      QUESTIONS,
      FORMATIONS,
    );

    expect(lignes.map((item) => item.tauxEchec)).toEqual([90, 50, 20]);
    expect(lignes[0]?.questionId).toBe('q2');
  });

  /*
   * **Le cas qui compte.** Une question sans réponse n'a pas de taux d'échec.
   * Lui en donner un de zéro la ferait passer pour parfaitement réussie, et
   * elle s'afficherait en bas d'une liste intitulée « ce qui a le plus
   * trébuché » — une question que personne n'a vue.
   */
  it('écarte les questions sans réponse plutôt que de les mettre à zéro', () => {
    const lignes = lignesTrebuchees(
      [ligne('q1', 0, 0), ligne('q2', 4, 1)],
      QUESTIONS,
      FORMATIONS,
    );

    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.questionId).toBe('q2');
  });

  it('rattache la formation pour sa forme', () => {
    const lignes = lignesTrebuchees([ligne('q1', 10, 5)], QUESTIONS, FORMATIONS);
    expect(lignes[0]?.formation?.nom).toBe('Formats et modalités');
  });

  /*
   * Une question retirée de la banque après la séance : le bilan la porte
   * toujours, le référentiel non. On affiche la ligne plutôt que de la
   * perdre — le taux reste vrai, et l'absence se dit.
   */
  it('survit à une question retirée de la banque', () => {
    const lignes = lignesTrebuchees([ligne('q-disparue', 8, 8)], QUESTIONS, FORMATIONS);
    expect(lignes[0]?.enonce).toBe('Question retirée de la banque');
    expect(lignes[0]?.tauxEchec).toBe(100);
  });
});

describe('echecMoyen', () => {
  /*
   * **Pondéré par le nombre de réponses, pas une moyenne de pourcentages.**
   * Une question posée à dix personnes et une posée à une seule ne pèsent pas
   * pareil ; moyenner leurs taux donnerait autant de poids à chacune.
   */
  it('pondère par le nombre de réponses', () => {
    // 9 échecs sur 10, puis 0 sur 1 : 9 sur 11, soit 82 %.
    expect(echecMoyen([ligne('q1', 10, 9), ligne('q2', 1, 0)])).toBe(82);
  });

  it('rend null quand personne n’a répondu', () => {
    expect(echecMoyen([ligne('q1', 0, 0)])).toBeNull();
    expect(echecMoyen([])).toBeNull();
  });

  it('rend zéro quand tout le monde a réussi', () => {
    expect(echecMoyen([ligne('q1', 10, 0)])).toBe(0);
  });
});
