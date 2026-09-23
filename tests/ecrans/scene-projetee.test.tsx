// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

/**
 * Rend l'écran. `dernier` n'appartient pas à la vue — c'est une propriété à
 * part de `SceneProjetee` — d'où sa place à côté des remplacements, et non
 * dedans.
 */
function poser(remplacements: Partial<VueScene> & { dernier?: boolean } = {}) {
  const { dernier = false, ...vueRemplacements } = remplacements;
  const rien = vi.fn();
  const onSuivante = vi.fn();
  render(
    <SceneProjetee
      vue={vue(vueRemplacements)}
      onReveler={rien}
      onSuivante={onSuivante}
      onRejouer={rien}
      onPause={rien}
      onReprendre={rien}
      onTerminer={rien}
      onAbandonner={rien}
      dernier={dernier}
    />,
  );
  return { onSuivante };
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
      screen.getByText('Plusieurs réponses attendues - une réponse incomplète est comptée fausse.'),
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

/**
 * Ce qui reste possible quand la question a disparu de la banque.
 *
 * **Le cul-de-sac que ces tests ferment.** Supprimer une question qu'une
 * séance préparée contient rend `question` nul. L'écran l'annonçait, mais ses
 * commandes restaient celles d'une question ordinaire : « Révéler la bonne
 * réponse », dont le gestionnaire sort en silence faute de question. Or
 * « Question suivante » n'apparaît qu'*après* révélation. La révélation ne
 * pouvant pas avoir lieu, il n'existait aucun chemin vers la question d'après :
 * devant la salle, la seule issue était d'arrêter la séance.
 */
describe('une question retirée de la banque', () => {
  it('n’offre plus de révéler : il n’y a rien à révéler', () => {
    poser({ question: null });

    expect(screen.queryByRole('button', { name: /Révéler/i })).toBeNull();
  });

  it('laisse passer à la suivante, et c’est l’action mise en avant', () => {
    const { onSuivante } = poser({ question: null });

    const suivante = screen.getByRole('button', { name: 'Question suivante' });
    fireEvent.click(suivante);

    expect(onSuivante).toHaveBeenCalledTimes(1);
  });

  it('propose de terminer quand c’est la dernière', () => {
    poser({ question: null, dernier: true });

    expect(screen.getByRole('button', { name: 'Terminer et classer' })).toBeTruthy();
  });

  /* L'animatrice n'a pas à deviner que le trou vient d'une suppression : rien,
     sur cet écran, ne relierait le vide à un geste fait trois jours plus tôt. */
  it('dit pourquoi il n’y a rien à montrer', () => {
    poser({ question: null });

    expect(screen.getByText(/retirée de la banque/)).toBeTruthy();
  });

  it('garde Pause et l’arrêt de séance', () => {
    poser({ question: null });

    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Arrêter/ })).toBeTruthy();
  });
});
