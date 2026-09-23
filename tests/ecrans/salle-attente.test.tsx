// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { rendre, session } from './aide';
import type { Appel, Participant } from '@/lib/session/depot';
import { fausseAuth } from '../aide/faux';

/**
 * Page 6 · La salle d'attente — ce que l'animatrice voit avant de commencer.
 *
 * **Trois choses qui doivent tenir, et une seule est évidente.**
 *
 * L'évidente : le code s'affiche, les présents se listent, les boutons agissent.
 *
 * La deuxième : **l'écran n'annonce jamais un chiffre qu'il n'a pas.** Sans
 * effectif déclaré il n'y a pas de dénominateur — « 8 sur 10 » deviendrait
 * « 8 sur 0 », ce qu'aucune relecture n'attrape parce que ça ressemble à un
 * nombre.
 *
 * La troisième, la plus facile à casser sans le voir : **le miroir de pause dit
 * exactement ce que la salle a sous les yeux.** S'il diverge, l'animatrice croit
 * savoir. Les deux écrans partagent donc une constante, et ce test la vérifie
 * depuis la constante, pas depuis le texte recopié.
 */

vi.mock(import('@/lib/firebase/client'), () => ({
  authentification: () => fausseAuth(null),
}));

const { SalleDAttente } = await import('@/composants/session/SalleDAttente');
const { TITRE_PAUSE_PARTICIPANT } = await import('@/lib/session/seance');
const { adresseRejoindre, CHEMIN_REJOINDRE } = await import('@/lib/session/rejoindre');

afterEach(cleanup);

function present(rang: number, presence: 'salle' | 'visio' = 'salle'): Participant {
  return {
    uid: `u${rang}`,
    nom: `Présent ${rang}`,
    avatar: 'bleu',
    presence,
  };
}

const GESTES = {
  onDemarrer: vi.fn(),
  onPause: vi.fn(),
  onReprendre: vi.fn(),
  onTerminer: vi.fn(),
  onAbandonner: vi.fn(),
  onVerrouiller: vi.fn(),
  onEcarterAppel: vi.fn(),
};

function monter(
  remplacements: Parameters<typeof session>[0] = {},
  participants: Participant[] = [],
  appels: Appel[] = [],
) {
  Object.values(GESTES).forEach((geste) => geste.mockReset());
  return rendre(
    <SalleDAttente
      session={session({ demarree: false, ...remplacements })}
      participants={participants}
      appels={appels}
      {...GESTES}
    />,
  );
}

/* ---------------------------------------------------------------- le code */

describe('Le code dicté à la salle', () => {
  it('affiche le code de la séance', () => {
    monter({ code: 'JEUDI7' });
    expect(screen.getByText('JEUDI7')).toBeTruthy();
  });

  /*
   * **L'adresse et le code se lisent ensemble ou ne servent à rien.** Quelqu'un
   * qui a le code sans l'adresse est aussi bloqué que l'inverse.
   */
  it('affiche l’adresse du site où l’écran est projeté, pas un domaine écrit à la main', () => {
    monter();

    /*
     * Ce que ce test garde : l'adresse lue sur le mur est celle de
     * l'application qui l'affiche. En jsdom, `location.host` vaut
     * « localhost:3000 » ; en production, le domaine servi. L'assertion porte
     * donc sur la règle, pas sur une valeur écrite deux fois.
     */
    expect(screen.getByText(`${window.location.host}${CHEMIN_REJOINDRE}`)).toBeTruthy();
    expect(adresseRejoindre()).toBe(`${window.location.host}${CHEMIN_REJOINDRE}`);
  });

  it('nomme le code tant que la séance n’est pas suspendue', () => {
    monter();
    expect(screen.getByText('Code de la séance')).toBeTruthy();
  });
});

/* ------------------------------------------------------------ les chiffres */

describe('Ce que la séance annonce', () => {
  it('affiche le titre et la description', () => {
    monter({ description: 'Les quatre questions les plus ratées du mois.' });
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.getByText('Les quatre questions les plus ratées du mois.')).toBeTruthy();
  });

  it('annonce une durée calculée', () => {
    monter({ questionIds: ['q1', 'q2'], dureeQuestionSecondes: 45 });
    expect(screen.getByText('minutes estimées')).toBeTruthy();
  });

  it('n’annonce aucune durée quand rien ne cadence la séance', () => {
    monter({ dureeQuestionSecondes: 0 });
    expect(screen.queryByText('minutes estimées')).toBeNull();
  });

  it('annonce l’effectif attendu quand il est déclaré', () => {
    monter({ effectifAttendu: 10 });
    expect(screen.getByText('attendus')).toBeTruthy();
  });

  /*
   * **Le cas qui compte.** Zéro veut dire « non déclaré », pas « zéro
   * personne ». Un dénominateur inventé serait pire que pas de dénominateur.
   */
  it('n’invente aucun effectif quand il n’est pas déclaré', () => {
    monter({ effectifAttendu: 0 });
    expect(screen.queryByText('attendus')).toBeNull();
  });
});

/* --------------------------------------------------------- dans la salle */

describe('Dans la salle', () => {
  function panneau() {
    return within(screen.getByRole('region', { name: 'Dans la salle' }));
  }

  it('dit que personne n’a rejoint plutôt que d’afficher une liste vide', () => {
    monter();
    expect(screen.getByText('Personne n’a encore rejoint')).toBeTruthy();
  });

  it('liste les présents et dit où ils sont', () => {
    monter({}, [present(1, 'salle'), present(2, 'visio')]);
    expect(panneau().getByText('Présent 1')).toBeTruthy();
    expect(panneau().getByText('en salle')).toBeTruthy();
    expect(panneau().getByText('en visio')).toBeTruthy();
  });

  it('compte ce qu’il manque quand l’effectif est déclaré', () => {
    monter({ effectifAttendu: 10 }, [present(1), present(2)]);
    expect(panneau().getByText('sur 10, 8 attendus')).toBeTruthy();
  });

  it('accorde le singulier sur le dernier absent', () => {
    monter({ effectifAttendu: 2 }, [present(1)]);
    expect(panneau().getByText('sur 2, 1 attendu')).toBeTruthy();
  });

  it('dit que tout le monde est là plutôt que d’annoncer « 0 attendu »', () => {
    monter({ effectifAttendu: 2 }, [present(1), present(2)]);
    expect(panneau().getByText('sur 2, tout le monde est là')).toBeTruthy();
  });

  it('compte sans dénominateur quand l’effectif n’est pas déclaré', () => {
    monter({ effectifAttendu: 0 }, [present(1), present(2)]);
    expect(panneau().getByText('présents')).toBeTruthy();
  });
});

/* --------------------------------------------------------------- la pause */

describe('La séance en pause', () => {
  /*
   * **Le miroir est vérifié depuis la constante, pas depuis le texte.** Un test
   * qui recopierait « Séance en pause » passerait encore le jour où l'écran du
   * participant change de formulation — et le miroir mentirait en silence.
   */
  it('montre à l’animatrice le titre exact que la salle a sous les yeux', () => {
    monter({ statut: 'pause' });
    expect(screen.getByText('La salle voit un écran d’attente')).toBeTruthy();
    expect(screen.getByText(TITRE_PAUSE_PARTICIPANT)).toBeTruthy();
  });

  it('remplace les chiffres par le miroir', () => {
    monter({ statut: 'pause', effectifAttendu: 10 });
    expect(screen.queryByText('attendus')).toBeNull();
  });

  it('propose de reprendre, et non de lancer', () => {
    monter({ statut: 'pause' });
    expect(screen.getByRole('button', { name: /Reprendre la séance/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Lancer la première question/ })).toBeNull();
  });

  it('reprend la séance', () => {
    monter({ statut: 'pause' });
    fireEvent.click(screen.getByRole('button', { name: /Reprendre la séance/ }));
    expect(GESTES.onReprendre).toHaveBeenCalledOnce();
  });
});

/* ------------------------------------------------------------ les commandes */

describe('Les commandes', () => {
  it('pousse la première question', () => {
    monter();
    fireEvent.click(screen.getByRole('button', { name: /Lancer la première question/ }));
    expect(GESTES.onDemarrer).toHaveBeenCalledOnce();
  });

  it('suspend la salle avant même d’avoir commencé', () => {
    monter();
    fireEvent.click(screen.getByRole('button', { name: /Mettre en pause/ }));
    expect(GESTES.onPause).toHaveBeenCalledOnce();
  });

  /*
   * **Les deux issues d'arrêt, et leurs conséquences écrites.**
   *
   * Avant la première question, terminer produirait un classement vide :
   * l'écran le dit au lieu de laisser choisir à l'aveugle.
   */
  it('ouvre les deux issues d’arrêt, conséquences comprises', () => {
    monter();
    fireEvent.click(screen.getByRole('button', { name: /Arrêter la séance/ }));

    const dialogue = within(screen.getByRole('dialog'));
    expect(dialogue.getByText(/Aucune question n’a encore été posée/)).toBeTruthy();
    expect(dialogue.getByText(/le classement serait vide/)).toBeTruthy();
  });

  /*
   * **Les deux moitiés, et l'une sans l'autre ment.**
   *
   * Les réponses *de la séance* partent — elles ne servaient qu'au classement.
   * La progression de chacun reste — ces réponses étaient réelles. Dire la
   * première seule ferait croire qu'on punit ceux qui avaient répondu ; dire la
   * seconde seule cacherait ce qui part. Ce test exige les deux.
   */
  it('dit ce qui est effacé et ce qui est conservé', () => {
    monter();
    fireEvent.click(screen.getByRole('button', { name: /Arrêter la séance/ }));

    const dialogue = within(screen.getByRole('dialog'));
    expect(dialogue.getByText(/réponses de la séance sont effacées/)).toBeTruthy();
    expect(dialogue.getByText(/progression de chacun est conservée/)).toBeTruthy();
  });

  it('abandonne depuis le dialogue', () => {
    monter();
    fireEvent.click(screen.getByRole('button', { name: /Arrêter la séance/ }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /^Abandonner$/ }),
    );
    expect(GESTES.onAbandonner).toHaveBeenCalledOnce();
  });

  it('referme le dialogue sans rien décider', () => {
    monter();
    fireEvent.click(screen.getByRole('button', { name: /Arrêter la séance/ }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Continuer la séance/ }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(GESTES.onTerminer).not.toHaveBeenCalled();
    expect(GESTES.onAbandonner).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------- la porte */

/**
 * « Verrouiller l'accès ».
 *
 * **Ce que ces tests gardent est la réversibilité et l'aveu.** Une pastille
 * qui ne saurait que fermer serait une pastille que personne n'ose toucher ;
 * et un écran projeté qui continue d'afficher un code de deux cents pixels
 * alors que la porte est close ment à la salle qui le recopie.
 */
describe('La porte de la salle', () => {
  it('propose de verrouiller quand la porte est ouverte', () => {
    monter({ verrouillee: false });
    const pastille = screen.getByRole('button', { name: /Verrouiller l’accès/ });
    expect(pastille.getAttribute('aria-pressed')).toBe('false');
  });

  it('ferme la porte au clic', () => {
    monter({ verrouillee: false });
    fireEvent.click(screen.getByRole('button', { name: /Verrouiller l’accès/ }));
    expect(GESTES.onVerrouiller).toHaveBeenCalledWith(true);
  });

  /* La moitié que la maquette ne dessine pas, et sans laquelle le verrou ne
     serait jamais posé. */
  it('rouvre la porte au clic suivant', () => {
    monter({ verrouillee: true });
    const pastille = screen.getByRole('button', { name: /Rouvrir l’accès/ });
    expect(pastille.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(pastille);
    expect(GESTES.onVerrouiller).toHaveBeenCalledWith(false);
  });

  /* **Le cas qui compte devant une salle.** Le code reste lisible — il
     resservira dès la réouverture — mais la ligne qui le surmonte dit qu'il
     n'ouvre plus. */
  it('dit au-dessus du code que celui-ci n’ouvre plus', () => {
    monter({ verrouillee: true });
    expect(screen.getByText(/ce code n’ouvre plus/)).toBeTruthy();
    expect(screen.getByText('JEUDI7')).toBeTruthy();
  });

  it('ne le dit pas quand la porte est ouverte', () => {
    monter({ verrouillee: false });
    expect(screen.queryByText(/ce code n’ouvre plus/)).toBeNull();
    expect(screen.getByText('Code de la séance')).toBeTruthy();
  });

  /* Verrouiller n'est pas mettre en pause : l'écran ne doit pas le laisser
     croire, et la séance reste ouverte. */
  it('ne touche ni à la pause ni au lancement', () => {
    monter({ verrouillee: true });
    expect(screen.getByRole('button', { name: /Lancer la première question/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Mettre en pause/ })).toBeTruthy();
  });

  /* La phrase qui répond à la question qu'on se pose la main sur le bouton. */
  it('dit que les présents ne sont pas touchés', () => {
    monter({ verrouillee: false });
    expect(screen.getByText(/Les présents ne sont pas touchés/)).toBeTruthy();
  });
});
