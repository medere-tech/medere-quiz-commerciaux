import { render, type RenderResult } from '@testing-library/react';

import type { Question } from '@/lib/questions/lecture';
import type { Rang, Session } from '@/lib/session/depot';

/**
 * L'outillage des tests d'écran.
 *
 * **La règle de rédaction, et elle n'est pas négociable ici.** On interroge
 * l'écran **par rôle et par texte visible**, jamais par classe ni par
 * structure. Un test qui connaît le balisage casse au premier ajustement de
 * mise en page et finit par être supprimé ou, pire, maintenu par principe.
 * Un test qui connaît ce que la personne voit ne casse que lorsque ce qu'elle
 * voit change — et c'est précisément ce qu'on veut apprendre.
 *
 * **Ce que ces tests remplacent.** Pas les règles, pas le dépôt : ceux-là
 * répondent à « qu'a-t-on le droit d'écrire » et « qu'écrit-on ». Ceux-ci
 * répondent à la troisième question, la seule encore sans réponse : **qu'est-ce
 * qui s'affiche**. `SessionParticipant` croise cinq statuts de séance avec cinq
 * états de vote ; aucune main n'a jamais parcouru plus de six de ces
 * combinaisons.
 */

/** Une séance en cours, sur sa première question. */
export function session(remplacements: Partial<Session> = {}): Session {
  return {
    id: 's1',
    code: 'JEUDI7',
    questionIds: ['q1', 'q2'],
    indexCourant: 0,
    revelee: false,
    statut: 'encours',
    animateurUid: 'uid-noemie',
    repartition: [],
    repondants: 0,
    dureeQuestionSecondes: 45,
    questionOuverteLeMs: Date.now(),
    creeeLeMs: Date.now(),
    ...remplacements,
  };
}

/** Un QCM à deux bonnes réponses : le cas que l'interface doit expliquer. */
export function question(remplacements: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    type: 'qcm',
    contexte: '',
    enonce: 'Quelles formations sont éligibles au DPC ?',
    options: { a: 'Parodontie', b: 'Implantologie', c: 'Endodontie', d: 'Orthodontie' },
    ordreOptions: ['a', 'b', 'c', 'd'],
    bonnesReponses: ['a', 'c'],
    explication: 'Les deux figurent au registre de l’ANDPC.',
    formationIds: ['f-1'],
    theme: 'reglementaire',
    difficulte: 1,
    statut: 'publiee',
    sourceFiche: '',
    sourceVersion: '',
    creeePar: 'uid-noemie',
    creeeLe: null,
    modifieeLe: null,
    ...remplacements,
  };
}

export function rang(remplacements: Partial<Rang> = {}): Rang {
  return {
    uid: 'uid-jordan',
    nom: 'Jordan',
    avatar: 'bleu',
    justes: 2,
    rang: 1,
    distinction: 'diamant',
    ...remplacements,
  };
}

export function rendre(element: React.ReactElement): RenderResult {
  return render(element);
}
