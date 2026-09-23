// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { question, rang, rendre, session } from './aide';
import type { Question } from '@/lib/questions/lecture';
import type { Rang, Session } from '@/lib/session/depot';
import { fausseAuth, fausseRequete } from '../aide/faux';

/**
 * 10a · Session collective, côté commercial — ce que l'écran montre.
 *
 * **Le trou que ces tests ferment.** Les règles disent ce qu'on a le droit
 * d'écrire, le dépôt dit ce qu'on écrit. Personne ne disait ce qui s'affiche.
 * Cet écran croise cinq statuts de séance avec cinq états de vote, plus la
 * bannière hors-ligne : une vingtaine de combinaisons, dont six au plus ont
 * jamais été vues à la main. C'est là que dorment les prochains défauts du
 * jeudi.
 *
 * **Deux des trois défauts trouvés en séance réelle au lot 7 étaient ici** : la
 * question qui ne se rafraîchit pas, et la réponse perdue au rechargement. Le
 * troisième — le chronomètre figé — était dans le dépôt, et c'est bien le
 * dépôt qui l'a attrapé. On ne prétend pas le contraire.
 *
 * **Interrogation par rôle et par texte visible, jamais par classe.** Un test
 * qui connaît le balisage casse au premier ajustement de mise en page. Si
 * malgré cela ils se révèlent fragiles, on les retire : un test maintenu par
 * principe coûte plus qu'il ne rapporte.
 */

/* ------------------------------------------------ le monde autour de l'écran */

let ecouteurSession: ((etat: Session | null, horsLigne: boolean) => void) | null = null;
let ecouteurQuestion: ((recue: Question | null) => void) | null = null;
let ecouteurClassement: ((rangs: Rang[] | null) => void) | null = null;
let ouverts = 0;

let adresse = fausseRequete();

const chargerMaReponse = vi.fn<() => Promise<string[] | null>>();
const repondreEnSession = vi.fn<() => Promise<void>>();
const rejoindre = vi.fn<() => Promise<void>>();
const chercherSessionParCode = vi.fn<() => Promise<Session | null>>();

/*
 * L'écran lit le code apporté par l'adresse — `/session?code=XXXXXX`, où mène
 * le QR de la salle d'attente. Sans contexte de routeur, `useSearchParams`
 * lève et l'écran entier ne rend plus : le faux rend une requête vide, qui est
 * le cas ordinaire, et les tests qui veulent un code la remplacent.
 */
vi.mock(import('next/navigation'), () => ({
  useSearchParams: () => adresse,
}));

vi.mock(import('@/lib/session/depot'), async (original) => {
  const vrai = await original<typeof import('@/lib/session/depot')>();

  const abonner = (poser: (rappel: never) => void) => (..._args: unknown[]) => {
    poser(_args[_args.length - 1] as never);
    ouverts += 1;
    return () => {
      ouverts -= 1;
    };
  };

  return {
    ...vrai,
    chercherSessionParCode: (...a: unknown[]) => chercherSessionParCode(...(a as [])),
    rejoindre: (...a: unknown[]) => rejoindre(...(a as [])),
    repondreEnSession: (...a: unknown[]) => repondreEnSession(...(a as [])),
    chargerMaReponse: (...a: unknown[]) => chargerMaReponse(...(a as [])),
    ecouterSession: abonner((rappel) => {
      ecouteurSession = rappel;
    }),
    ecouterQuestion: abonner((rappel) => {
      ecouteurQuestion = rappel;
    }),
    ecouterClassement: abonner((rappel) => {
      ecouteurClassement = rappel;
    }),
  };
});

/**
 * L'authentification, réduite à ce dont l'écran se sert : un uid et un prénom.
 *
 * Le vrai module démarre App Check, qui n'a rien à faire dans un test d'écran
 * — et qui ne démarrerait pas, faute de navigateur attesté.
 */
vi.mock(import('@/lib/firebase/client'), () => ({
  authentification: () => fausseAuth({ uid: 'uid-jordan', displayName: 'Jordan Bakary' }),
}));

const { SessionParticipant } = await import('@/composants/session/SessionParticipant');

beforeEach(() => {
  adresse = fausseRequete();
  ecouteurSession = null;
  ecouteurQuestion = null;
  ecouteurClassement = null;
  ouverts = 0;
  chargerMaReponse.mockResolvedValue(null);
  repondreEnSession.mockResolvedValue(undefined);
  rejoindre.mockResolvedValue(undefined);
  chercherSessionParCode.mockResolvedValue(session());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Amène l'écran jusqu'à la séance rejointe, comme un participant le ferait. */
async function rejoindreLaSeance(): Promise<void> {
  rendre(<SessionParticipant />);

  fireEvent.change(screen.getByLabelText(/code de la séance/i), { target: { value: 'JEUDI7' } });
  fireEvent.click(screen.getByRole('button', { name: /rejoindre/i }));

  await waitFor(() => expect(ecouteurSession).not.toBeNull());
  await act(async () => {});
}

/*
 * Les trois pousseurs.
 *
 * `act` n'est pas une formalité : ces rappels viennent de l'extérieur de
 * React — c'est tout l'intérêt d'un écouteur temps réel — et sans lui la mise
 * à jour n'est pas vidée avant l'assertion. Le test échouerait sur un écran de
 * chargement, ce qui ressemblerait à un défaut de l'écran.
 */
async function poserLaSeance(etat: Session | null, horsLigne = false): Promise<void> {
  await act(async () => {
    ecouteurSession?.(etat, horsLigne);
  });
}

async function poserLaQuestion(recue: Question | null): Promise<void> {
  await act(async () => {
    ecouteurQuestion?.(recue);
  });
}

async function poserLeClassement(rangs: Rang[] | null): Promise<void> {
  await act(async () => {
    ecouteurClassement?.(rangs);
  });
}

/* ============================================================ rejoindre */

describe('rejoindre une séance', () => {
  it('propose le prénom du compte sans l’imposer', async () => {
    rendre(<SessionParticipant />);

    // Le nom projeté sur un mur : on propose, on ne décide pas.
    await waitFor(() =>
      expect(screen.getByLabelText(/votre nom au classement/i)).toHaveProperty('value', 'Jordan'),
    );
  });

  it('dit qu’aucune séance ne porte ce code, sans parler de panne', async () => {
    chercherSessionParCode.mockResolvedValue(null);
    rendre(<SessionParticipant />);

    fireEvent.change(screen.getByLabelText(/code de la séance/i), { target: { value: 'ZZZZZZ' } });
    fireEvent.click(screen.getByRole('button', { name: /rejoindre/i }));

    // Un code mal recopié n'est pas une erreur du système : le message doit
    // renvoyer à ce que la personne peut faire.
    expect(await screen.findByText(/aucune séance ouverte/i)).toBeTruthy();
  });

  it('signale une panne de recherche autrement qu’un code inconnu', async () => {
    chercherSessionParCode.mockRejectedValue(new Error('réseau'));
    rendre(<SessionParticipant />);

    fireEvent.change(screen.getByLabelText(/code de la séance/i), { target: { value: 'JEUDI7' } });
    fireEvent.click(screen.getByRole('button', { name: /rejoindre/i }));

    // Les deux cas se ressemblent à l'écran s'ils partagent leur message, et
    // la personne réessaie indéfiniment avec le bon code.
    const message = await screen.findByText(/n’a pas abouti|réessayez/i);
    expect(message).toBeTruthy();
  });
});

/* ========================================================= les états */

describe('les états de la séance', () => {
  beforeEach(async () => {
    await rejoindreLaSeance();
  });

  it('attend la question sans crier à la panne', async () => {
    await poserLaSeance(session());

    // L'écouteur n'a pas encore parlé. Annoncer une question retirée ici
    // serait un mensonge : c'est un chargement.
    expect(screen.queryByText(/a été retirée/i)).toBeNull();
  });

  /*
   * **Une question retirée reste un écran de séance.**
   *
   * C'était un encadré d'erreur seul au milieu de la page : sur un téléphone,
   * au milieu d'une séance, il ne ressemblait à aucun des écrans qui
   * l'entouraient, et le commercial croyait en être sorti. Ce qui suit fixe les
   * trois choses qu'il doit continuer de voir — où il en est, ce qui se passe,
   * ce qui va arriver.
   */
  describe('quand la question a été retirée de la banque', () => {
    it('le dit, et sans en faire une panne', async () => {
      await poserLaSeance(session());
      await poserLaQuestion(null);

      expect(await screen.findByRole('heading', { name: /a été retirée/i })).toBeTruthy();
    });

    it('garde le rang dans la séance : on n’en est pas sorti', async () => {
      await poserLaSeance(session({ indexCourant: 1 }));
      await poserLaQuestion(null);

      expect(await screen.findByText('Question 2 sur 2')).toBeTruthy();
    });

    it('dit que la suite arrive ici, et que rien n’est compté', async () => {
      await poserLaSeance(session());
      await poserLaQuestion(null);

      expect(await screen.findByText(/toujours dans la séance/i)).toBeTruthy();
      expect(screen.getByText(/ne compte pas pour vous/i)).toBeTruthy();
    });

    /*
     * Le décompte dit combien de temps il reste pour répondre. Il n'y a rien à
     * répondre : le faire tourner serait le seul élément de l'écran à mentir.
     *
     * **L'assertion porte sur le texte, pas sur un rôle.** `Chronometre` est
     * `aria-hidden` et ne déclare aucun rôle — un `queryByRole('timer')` aurait
     * été vert avec ou sans lui, donc n'aurait rien gardé. Il rend « N s », et
     * c'est ce qu'on cherche. Vérifié en le remettant : le test tombe.
     */
    it('ne fait pas tourner de chronomètre', async () => {
      await poserLaSeance(session());
      await poserLaQuestion(null);

      await screen.findByRole('heading', { name: /a été retirée/i });
      expect(screen.queryByText(/^\d+ s$/)).toBeNull();
      expect(screen.queryByText(/temps écoulé/)).toBeNull();
    });

    it('n’offre rien à cocher ni à envoyer', async () => {
      await poserLaSeance(session());
      await poserLaQuestion(null);

      await screen.findByRole('heading', { name: /a été retirée/i });
      expect(screen.queryByRole('button', { name: /envoyer/i })).toBeNull();
      expect(screen.queryByRole('radio')).toBeNull();
      expect(screen.queryByRole('checkbox')).toBeNull();
    });
  });

  it('affiche la question et ses options', async () => {
    await poserLaSeance(session());
    await poserLaQuestion(question());

    expect(await screen.findByText('Quelles formations sont éligibles au DPC ?')).toBeTruthy();
    expect(screen.getByText('Parodontie')).toBeTruthy();
    expect(screen.getByText('Orthodontie')).toBeTruthy();
  });

  it('annonce qu’un QCM attend plusieurs réponses, et ce qu’il en coûte', async () => {
    await poserLaSeance(session());
    await poserLaQuestion(question());

    // La règle la plus contre-intuitive de l'outil : une sélection incomplète
    // est comptée fausse. Elle ne peut pas reposer sur la forme d'un marqueur.
    expect(await screen.findByText(/plusieurs réponses attendues/i)).toBeTruthy();
    expect(screen.getByText(/incomplète est comptée fausse/i)).toBeTruthy();
  });

  it('dit « une seule réponse » quand il n’y en a qu’une', async () => {
    await poserLaSeance(session());
    await poserLaQuestion(question({ bonnesReponses: ['a'] }));

    expect(await screen.findByText(/une seule réponse/i)).toBeTruthy();
  });

  it('décrit le groupe d’options pour les technologies d’assistance', async () => {
    await poserLaSeance(session());
    await poserLaQuestion(question());

    // Sans cela, un lecteur d'écran annonce une suite de boutons sans dire
    // qu'ils forment un choix ni combien de réponses sont attendues.
    const groupe = await screen.findByRole('group', { name: /réponses possibles/i });
    const decrit = groupe.getAttribute('aria-describedby');
    expect(decrit).toBeTruthy();
    expect(document.getElementById(decrit ?? '')?.textContent).toMatch(/plusieurs réponses/i);
  });

  it('annonce la pause au lieu de laisser la question ouverte', async () => {
    await poserLaSeance(session({ statut: 'pause' }));

    // Le pire état serait dix personnes qui appuient sur « Envoyer » et se
    // font refuser sans comprendre.
    expect(await screen.findByText(/séance en pause/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /envoyer/i })).toBeNull();
  });

  it('dit qu’une séance interrompue ne sera pas classée, et que les réponses comptent', async () => {
    await poserLaSeance(session({ statut: 'abandonnee' }));

    // Un vrai titre, pas un texte qui y ressemble : c'est ainsi qu'on le
    // trouve au lecteur d'écran, et c'est l'écran où l'on cherche à
    // comprendre ce qui se passe.
    expect(await screen.findByRole('heading', { name: /séance interrompue/i })).toBeTruthy();
    expect(screen.getByText(/comptent quand même dans votre progression/i)).toBeTruthy();
  });

  it('attend le classement sans laisser croire qu’il n’y en aura pas', async () => {
    await poserLaSeance(session({ statut: 'terminee' }));

    expect(await screen.findByText(/dès qu’il est établi/i)).toBeTruthy();
  });

  it('montre le classement quand il arrive', async () => {
    await poserLaSeance(session({ statut: 'terminee' }));
    await poserLeClassement([rang(), rang({ uid: 'uid-lea', nom: 'Léa', rang: 2, distinction: 'or' })]);

    /*
     * **La révélation est mise en scène, et le délai est la fonctionnalité.**
     * Le rang personnel, puis le podium qui se remplit par le bas, puis le
     * prix : quelques secondes au total. C'est la seule exception assumée à
     * `prefers-reduced-motion` du projet. Le test attend donc la fin de la
     * mise en scène au lieu de la désarmer — désarmer reviendrait à tester un
     * écran que personne ne verra.
     */
    // Motif et non chaîne exacte : le nom du participant partage son nœud de
    // texte avec « · vous ». Chercher la chaîne entière reviendrait à connaître
    // la composition de la phrase, c'est-à-dire le balisage.
    expect(await screen.findByText(/Jordan/, {}, { timeout: 10_000 })).toBeTruthy();
    expect(await screen.findByText(/Léa/, {}, { timeout: 10_000 })).toBeTruthy();
  });

  it('annonce la perte de connexion plutôt que d’afficher une question périmée', async () => {
    await poserLaSeance(session(), true);
    await poserLaQuestion(question());

    expect(await screen.findByText(/hors ligne|connexion/i)).toBeTruthy();
  });
});

/* ========================================================= le vote */

describe('le vote', () => {
  beforeEach(async () => {
    await rejoindreLaSeance();
    await poserLaSeance(session());
    await poserLaQuestion(question());
    await screen.findByText('Quelles formations sont éligibles au DPC ?');
  });

  it('envoie l’ensemble sélectionné, pas la dernière option cochée', async () => {
    fireEvent.click(screen.getByText('Parodontie'));
    fireEvent.click(screen.getByText('Endodontie'));
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));

    // Une réponse partielle est fausse : l'ensemble part entier ou rien.
    await waitFor(() => expect(repondreEnSession).toHaveBeenCalledTimes(1));
    expect(repondreEnSession.mock.calls[0]).toEqual(
      expect.arrayContaining([expect.arrayContaining(['a', 'c'])]),
    );
  });

  it('refuse d’envoyer une réponse vide', async () => {
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));

    await waitFor(() => expect(repondreEnSession).not.toHaveBeenCalled());
  });

  it('éteint le vote une fois la réponse partie', async () => {
    fireEvent.click(screen.getByText('Parodontie'));
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));

    await waitFor(() => expect(screen.getByText(/réponse envoyée/i)).toBeTruthy());
  });

  it('distingue « trop tard » d’une panne d’envoi', async () => {
    repondreEnSession.mockRejectedValue(
      Object.assign(new Error('refus'), { code: 'permission-denied' }),
    );

    fireEvent.click(screen.getByText('Parodontie'));
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));

    // Le refus des règles après révélation n'est pas une panne, et l'écran ne
    // doit pas envoyer quelqu'un chercher un problème de réseau.
    expect(await screen.findByText(/trop tard|révélée|correction/i)).toBeTruthy();
  });

  /**
   * **Le défaut trouvé en séance réelle, celui-ci.** Quelqu'un recharge sa page
   * et retrouvait un écran vierge avec un « Envoyer » actif — que les règles
   * auraient refusé sans qu'il comprenne pourquoi.
   */
  it('restaure la réponse déjà donnée après un rechargement', async () => {
    cleanup();
    chargerMaReponse.mockResolvedValue(['a', 'c']);

    await rejoindreLaSeance();
    await poserLaSeance(session());
    await poserLaQuestion(question());

    await waitFor(() => expect(screen.getByText(/réponse envoyée/i)).toBeTruthy());
  });

  it('explique pourquoi on ne revote pas quand l’animatrice rouvre le vote', async () => {
    cleanup();
    chargerMaReponse.mockResolvedValue(['a']);

    await rejoindreLaSeance();
    await poserLaSeance(session());
    await poserLaQuestion(question());
    await screen.findByText(/réponse envoyée/i);

    // Le vote rouvre pour ceux qui n'avaient pas répondu. Sans cette phrase,
    // celui qui a déjà répondu voit un bouton éteint et ne sait pas pourquoi.
    expect(screen.getByText(/ne se change plus/i)).toBeTruthy();
  });

  it('montre la correction et ce qui manquait à la révélation', async () => {
    fireEvent.click(screen.getByText('Parodontie'));
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));
    await screen.findByText(/réponse envoyée/i);

    await poserLaSeance(session({ revelee: true, repartition: [3, 1, 2, 0], repondants: 4 }));

    // Une réponse partielle est fausse, et l'interface doit montrer ce qui
    // manquait — c'est la règle du QCM multiple.
    expect(await screen.findByText(/Les deux figurent au registre/i)).toBeTruthy();
  });
});

/* ================================================== hygiène des écouteurs */

describe('les écouteurs temps réel', () => {
  it('se referment quand l’écran disparaît', async () => {
    await rejoindreLaSeance();
    await poserLaSeance(session({ statut: 'terminee' }));

    expect(ouverts).toBeGreaterThan(0);
    cleanup();

    // Un écouteur laissé ouvert continue de lire Firestore après la séance,
    // et se paie en quota autant qu'en confusion.
    expect(ouverts).toBe(0);
  });
});
