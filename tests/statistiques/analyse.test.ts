import { describe, expect, it } from 'vitest';

import { classer, parFormation, resumer, tauxEchec, TENTATIVES_FIABLES } from '@/lib/statistiques/analyse';
import { enStats } from '@/lib/statistiques/modele';
import type { Formation } from '@/lib/formations/depot';
import type { Question } from '@/lib/questions/depot';
import type { StatsQuestion } from '@/lib/statistiques/modele';

/**
 * Ce que ces tests protègent : le seuil de fiabilité, et le fait qu'aucun
 * taux n'est publié sous ce seuil. Une question ratée une fois sur une
 * tentative afficherait cent pour cent d'échec et enverrait Noémie réécrire
 * une fiche pour rien.
 */

function question(partiel: Partial<Question> & { id: string }): Question {
  return {
    type: 'qcm',
    contexte: '',
    enonce: 'Énoncé',
    options: { o1: 'A', o2: 'B' },
    ordreOptions: ['o1', 'o2'],
    bonnesReponses: ['o1'],
    explication: 'Parce que.',
    formationIds: ['recA'],
    theme: 'publics',
    difficulte: 1,
    statut: 'publiee',
    sourceFiche: '',
    sourceVersion: '',
    creeePar: 'uid',
    modifieeLe: null,
    creeeLe: null,
    ...partiel,
  } as unknown as Question;
}

function formation(id: string, nom: string): Formation {
  return {
    id,
    nom,
    numeroActionDpc: '',
    cibles: [],
    format: '',
    modalite: '',
    dureeTotale: '',
    urlWebflow: '',
    blocsCertification: [],
    actif: true,
  };
}

function stat(questionId: string, tentatives: number, echecs: number): StatsQuestion {
  return { questionId, tentatives, echecs, majLe: null };
}

const FORMATIONS = [formation('recA', 'Dermoscopie'), formation('recB', 'Ménopause')];

describe('tauxEchec', () => {
  it('arrondit à l’entier', () => {
    expect(tauxEchec(1, 3)).toBe(33);
    expect(tauxEchec(2, 3)).toBe(67);
    expect(tauxEchec(5, 10)).toBe(50);
  });

  it('ne divise pas par zéro', () => {
    expect(tauxEchec(0, 0)).toBe(0);
    expect(tauxEchec(3, 0)).toBe(0);
  });
});

describe('classer', () => {
  it('classe les questions fiables par taux d’échec décroissant', () => {
    const questions = [question({ id: 'q1' }), question({ id: 'q2' }), question({ id: 'q3' })];
    const stats = [stat('q1', 10, 2), stat('q2', 10, 9), stat('q3', 10, 5)];

    const { fiables } = classer(questions, stats, FORMATIONS);

    expect(fiables.map((ligne) => ligne.question.id)).toEqual(['q2', 'q3', 'q1']);
    expect(fiables[0]?.tauxEchec).toBe(90);
  });

  it('écarte du classement les questions sous le seuil de fiabilité', () => {
    // Une seule tentative ratée ferait 100 % et prendrait la tête.
    const questions = [question({ id: 'rare' }), question({ id: 'servie' })];
    const stats = [stat('rare', 1, 1), stat('servie', 20, 12)];

    const { fiables, tropPeu } = classer(questions, stats, FORMATIONS);

    expect(fiables.map((ligne) => ligne.question.id)).toEqual(['servie']);
    expect(tropPeu.map((ligne) => ligne.question.id)).toEqual(['rare']);
  });

  it('place le seuil à trois tentatives incluses', () => {
    const questions = [question({ id: 'juste-au-seuil' }), question({ id: 'juste-en-dessous' })];
    const stats = [
      stat('juste-au-seuil', TENTATIVES_FIABLES, 1),
      stat('juste-en-dessous', TENTATIVES_FIABLES - 1, 1),
    ];

    const { fiables, tropPeu } = classer(questions, stats, FORMATIONS);

    expect(fiables.map((ligne) => ligne.question.id)).toEqual(['juste-au-seuil']);
    expect(tropPeu.map((ligne) => ligne.question.id)).toEqual(['juste-en-dessous']);
  });

  it('sépare les questions jamais tentées', () => {
    const questions = [question({ id: 'vue' }), question({ id: 'neuve' }), question({ id: 'vide' })];
    const stats = [stat('vue', 5, 1), stat('vide', 0, 0)];

    const { fiables, jamaisTentees } = classer(questions, stats, FORMATIONS);

    expect(fiables).toHaveLength(1);
    expect(jamaisTentees.map((q) => q.id).sort()).toEqual(['neuve', 'vide']);
  });

  it('départage deux taux égaux par le nombre de tentatives', () => {
    const questions = [question({ id: 'peu' }), question({ id: 'beaucoup' })];
    const stats = [stat('peu', 4, 2), stat('beaucoup', 40, 20)];

    const { fiables } = classer(questions, stats, FORMATIONS);

    expect(fiables.map((ligne) => ligne.question.id)).toEqual(['beaucoup', 'peu']);
  });

  it('rattache chaque ligne à sa formation, et tolère une formation retirée', () => {
    const questions = [
      question({ id: 'q1', formationIds: ['recA'] }),
      question({ id: 'q2', formationIds: ['disparue'] }),
    ];
    const stats = [stat('q1', 5, 1), stat('q2', 5, 1)];

    const { fiables } = classer(questions, stats, FORMATIONS);
    const parQuestion = new Map(fiables.map((ligne) => [ligne.question.id, ligne.formation]));

    expect(parQuestion.get('q1')?.nom).toBe('Dermoscopie');
    expect(parQuestion.get('q2')).toBeNull();
  });
});

describe('parFormation', () => {
  it('additionne les tentatives plutôt que de moyenner des taux', () => {
    // Une question servie trente fois doit peser plus qu'une servie trois fois.
    const questions = [
      question({ id: 'q1', formationIds: ['recA'] }),
      question({ id: 'q2', formationIds: ['recA'] }),
    ];
    const stats = [stat('q1', 30, 3), stat('q2', 3, 3)];

    const [dermoscopie] = parFormation(questions, stats, FORMATIONS);

    expect(dermoscopie?.tentatives).toBe(33);
    expect(dermoscopie?.echecs).toBe(6);
    expect(dermoscopie?.tauxEchec).toBe(18);
  });

  it('compte une question pour chacune de ses formations', () => {
    const questions = [question({ id: 'q1', formationIds: ['recA', 'recB'] })];
    const stats = [stat('q1', 10, 5)];

    const resultat = parFormation(questions, stats, FORMATIONS);

    expect(resultat).toHaveLength(2);
    expect(resultat.every((ligne) => ligne.tentatives === 10)).toBe(true);
  });

  it('ignore les formations sans réponse enregistrée', () => {
    const questions = [question({ id: 'q1', formationIds: ['recA'] })];
    const stats = [stat('q1', 4, 1)];

    expect(parFormation(questions, stats, FORMATIONS).map((l) => l.formation.id)).toEqual(['recA']);
  });

  it('classe les formations les plus fragiles d’abord', () => {
    const questions = [
      question({ id: 'q1', formationIds: ['recA'] }),
      question({ id: 'q2', formationIds: ['recB'] }),
    ];
    const stats = [stat('q1', 10, 1), stat('q2', 10, 8)];

    expect(parFormation(questions, stats, FORMATIONS).map((l) => l.formation.id)).toEqual([
      'recB',
      'recA',
    ]);
  });
});

describe('resumer', () => {
  it('compte les réponses et le taux d’échec global', () => {
    const questions = [question({ id: 'q1' }), question({ id: 'q2' })];
    const stats = [stat('q1', 10, 3), stat('q2', 10, 5)];

    expect(resumer(questions, stats)).toEqual({
      reponses: 20,
      tauxEchecMoyen: 40,
      questionsPubliees: 2,
      jamaisTentees: 0,
    });
  });

  it('ignore les agrégats de questions dépubliées ou supprimées', () => {
    // L'agrégat survit à la question : il ne doit pas gonfler les totaux d'un
    // écran qui ne parle que des questions publiées.
    const questions = [question({ id: 'q1' })];
    const stats = [stat('q1', 10, 3), stat('fantome', 90, 90)];

    const resume = resumer(questions, stats);

    expect(resume.reponses).toBe(10);
    expect(resume.tauxEchecMoyen).toBe(30);
  });

  it('compte les questions publiées que personne n’a encore vues', () => {
    const questions = [question({ id: 'q1' }), question({ id: 'q2' }), question({ id: 'q3' })];

    expect(resumer(questions, [stat('q1', 2, 0)]).jamaisTentees).toBe(2);
  });
});

describe('enStats', () => {
  it('borne les échecs au nombre de tentatives', () => {
    // Un agrégat incohérent afficherait un taux supérieur à cent pour cent.
    expect(enStats('q1', { tentatives: 4, echecs: 9 }).echecs).toBe(4);
  });

  it('tolère un agrégat incomplet', () => {
    expect(enStats('q1', {})).toEqual({
      questionId: 'q1',
      tentatives: 0,
      echecs: 0,
      majLe: null,
    });
  });

  it('refuse les valeurs qui ne sont pas des nombres positifs', () => {
    expect(enStats('q1', { tentatives: -3, echecs: 'beaucoup' }).tentatives).toBe(0);
  });
});
