// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { question } from './aide';
import { SceneProjetee, type VueScene } from '@/composants/session/SceneProjetee';

/**
 * 10b · L'écran projeté sur le mur, devant la salle.
 *
 * **Une partie de la salle est en visioconférence et voit cet écran avec du
 * retard.** Ce qui y est écrit n'est donc jamais la seule source — la question
 * est poussée sur chaque appareil — mais c'est la seule que certains lisent en
 * grand. Une consigne absente ici et présente sur les téléphones serait un
 * écart entre ce que la salle voit et ce qu'elle lit.
 */

function vue(remplacements: Partial<VueScene> = {}): VueScene {
  return {
    code: 'JEUDI7',
    numero: 1,
    total: 8,
    question: question(),
    revelee: false,
    enPause: false,
    comptes: [0, 0, 0, 0],
    reponsesRecues: 0,
    participants: 4,
    questionOuverteLeMs: Date.now(),
    dureeQuestionSecondes: 45,
    ...remplacements,
  };
}

function poser(remplacements: Partial<VueScene> = {}) {
  const rien = vi.fn();
  render(
    <SceneProjetee
      vue={vue(remplacements)}
      onReveler={rien}
      onSuivante={rien}
      onRejouer={rien}
      onPause={rien}
      onReprendre={rien}
      onTerminer={rien}
      onAbandonner={rien}
      dernier={false}
    />,
  );
}

afterEach(cleanup);

describe('la consigne de réponse', () => {
  it('annonce le QCM multiple et sa conséquence', async () => {
    poser();

    expect(screen.getByText(/plusieurs réponses attendues/i)).toBeTruthy();
    expect(screen.getByText(/incomplète est comptée fausse/i)).toBeTruthy();
  });

  it('dit « une seule réponse » quand il n’y en a qu’une', () => {
    poser({ question: question({ bonnesReponses: ['a'] }) });

    expect(screen.getByText(/une seule réponse/i)).toBeTruthy();
  });

  it('dit la même chose que les téléphones de la salle', () => {
    poser();

    // Trois formulations pour une même règle seraient pires que le silence :
    // la consigne est un seul composant, partagé par les trois écrans.
    expect(
      screen.getByText('Plusieurs réponses attendues — une réponse incomplète est comptée fausse.'),
    ).toBeTruthy();
  });
});

describe('l’étiquette de la question', () => {
  it('annonce le nombre de réponses attendues, pas le format', () => {
    poser();

    // « Choix multiples » nommait le format et se lisait comme « plusieurs
    // réponses » : sur un QCM à réponse unique, l'étiquette contredisait la
    // consigne affichée trois lignes plus bas.
    // Chaîne exacte : la consigne, juste en dessous, commence par les mêmes
    // mots. C'est l'étiquette qu'on vise, pas la phrase.
    expect(screen.getByText('Plusieurs réponses')).toBeTruthy();
    expect(screen.queryByText(/choix multiples/i)).toBeNull();
  });

  it('dit « Une réponse » sur un QCM à bonne réponse unique', () => {
    poser({ question: question({ bonnesReponses: ['a'] }) });

    expect(screen.getByText('Une réponse')).toBeTruthy();
    expect(screen.queryByText(/choix multiples/i)).toBeNull();
  });

  it('garde « Vrai ou faux », qui nomme les options et ne trompe personne', () => {
    poser({
      question: question({ type: 'vf', options: { a: 'Vrai', b: 'Faux' }, ordreOptions: ['a', 'b'], bonnesReponses: ['a'] }),
    });

    expect(screen.getByText('Vrai ou faux')).toBeTruthy();
  });
});

describe('le bouton de réouverture', () => {
  it('dit « Rouvrir le vote », pas « Rejouer »', () => {
    poser({ revelee: true });

    // Personne ne rejoue : les règles refusent une seconde réponse à la même
    // question. Devant la salle, un libellé qui ment est pire qu'un libellé
    // modeste.
    expect(screen.getByRole('button', { name: /rouvrir le vote/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /rejouer/i })).toBeNull();
  });
});

describe('la question retirée', () => {
  it('le dit au lieu de laisser un écran vide devant la salle', () => {
    poser({ question: null });

    expect(screen.getByText(/n’est plus publiée/i)).toBeTruthy();
  });
});
