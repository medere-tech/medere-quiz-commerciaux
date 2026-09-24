// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rendre } from './aide';
import type { Formation } from '@/lib/formations/depot';
import type { QuestionListee } from '@/lib/questions/lecture';
import type { Session } from '@/lib/session/depot';
import type { StatsQuestion } from '@/lib/statistiques/modele';
import { fausseAuth, fauxRouteur } from '../aide/faux';

/**
 * Page 7 · Composer une séance — ce que l'écran fait.
 *
 * **Quatre règles qui se cassent en silence**, et que rien d'autre ne
 * vérifie :
 *
 * 1. **Le numéro de la case est le rang de passage.** S'il cessait de suivre
 *    l'ordre de sélection, l'écran mentirait sur la séance qu'il compose — et
 *    cela ne se verrait qu'un jeudi, devant la salle.
 * 2. **Prendre une formation entière ne renumérote pas les autres.** C'est le
 *    seul endroit où l'ordre peut se réécrire tout seul.
 * 3. **Sans chronomètre, aucune durée n'est annoncée.** « libre », jamais
 *    « 0 min » : un zéro a l'aplomb d'un chiffre juste.
 * 4. **Une séance préparée n'est pas « déjà posée ».** Elle n'a pas encore été
 *    jouée ; l'avertissement porterait sur un futur.
 */

const chargerStatistiques = vi.fn<() => Promise<StatsQuestion[]>>();
const mesSeances = vi.fn<() => Promise<Session[]>>();
const creerSession = vi.fn<() => Promise<string>>();
const preparerEtLancer = vi.fn<() => Promise<string>>();
const maSessionEnCours = vi.fn<() => Promise<Session | null>>();
const terminerSession = vi.fn<() => Promise<void>>();
const abandonner = vi.fn<() => Promise<void>>();
const pousser = vi.fn();

vi.mock(import('@/lib/firebase/client'), () => ({
  authentification: () => fausseAuth({ uid: 'uid-noemie', displayName: 'Noémie Vasseur' }),
}));

vi.mock(import('@/lib/statistiques/depot'), () => ({
  chargerStatistiques: () => chargerStatistiques(),
}));

vi.mock(import('next/navigation'), () => ({
  useRouter: () => fauxRouteur({ push: pousser }),
}));

vi.mock(import('@/lib/session/depot'), async (original) => {
  const vrai = await original<typeof import('@/lib/session/depot')>();
  return {
    ...vrai,
    mesSeances: () => mesSeances(),
    creerSession: (...a: unknown[]) => creerSession(...(a as [])),
    preparerEtLancer: (...a: unknown[]) => preparerEtLancer(...(a as [])),
    maSessionEnCours: () => maSessionEnCours(),
    terminerSession: () => terminerSession(),
    abandonner: () => abandonner(),
    modifierSeance: vi.fn(async () => {}),
  };
});

const { ComposerSeance } = await import('@/composants/session/ComposerSeance');

/* ------------------------------------------------------------ le référentiel */

const FORMATIONS: Formation[] = [
  formation('f-modalites', 'Formats et modalités', 'Chirurgien dentiste'),
  formation('f-dentaire', 'Urgences au cabinet dentaire', 'Infirmier'),
];

function formation(id: string, nom: string, cible: string): Formation {
  return {
    id,
    airtableId: id,
    numeroActionDpc: '12345678901',
    nom,
    cibles: [cible],
    format: 'E-Learning',
    modalite: 'Formation continue',
    blocsCertification: ['2'],
    dureeTotale: '7 heures',
    urlWebflow: '',
    actif: true,
  } as Formation;
}

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

const QUESTIONS: QuestionListee[] = [
  question('q1', 'Durée minimale d’un e-learning indemnisé ?', 'f-modalites'),
  question('q2', 'Le présentiel se réserve la veille.', 'f-modalites'),
  question('q3', 'Professionnels admis au cabinet dentaire ?', 'f-dentaire'),
  question('q4', 'Les assistants dentaires ont un RPPS.', 'f-dentaire'),
];

const REFERENTIEL = { questions: QUESTIONS, formations: FORMATIONS };

function stat(questionId: string, tentatives: number, echecs: number): StatsQuestion {
  return { questionId, tentatives, echecs, majLe: null };
}

beforeEach(() => {
  chargerStatistiques.mockReset().mockResolvedValue([
    stat('q1', 20, 16),
    stat('q2', 20, 4),
    stat('q3', 20, 12),
    stat('q4', 20, 2),
  ]);
  mesSeances.mockReset().mockResolvedValue([]);
  creerSession.mockReset().mockResolvedValue('s-neuve');
  preparerEtLancer.mockReset().mockResolvedValue('s-neuve');
  // Le cas courant : aucune séance ne tourne, donc rien ne bloque.
  maSessionEnCours.mockReset().mockResolvedValue(null);
  terminerSession.mockReset().mockResolvedValue();
  abandonner.mockReset().mockResolvedValue();
  pousser.mockReset();
});

afterEach(cleanup);

async function monter() {
  rendre(<ComposerSeance referentiel={REFERENTIEL} />);
  await screen.findByRole('heading', { name: 'Choisissez les questions' });
}

/**
 * Le bouton d'une question, dans la banque.
 *
 * **Une fois retenue, son énoncé existe à deux endroits** — la banque et le
 * panneau d'ordre. On interroge donc le bouton par son nom accessible : dans
 * le panneau, l'énoncé n'est pas un bouton, il est le texte d'une ligne.
 */
function ligne(enonce: string): HTMLButtonElement {
  return screen.getByRole('button', {
    // Les commandes du panneau d'ordre citent l'énoncé dans leur libellé —
    // « Avancer « … » », « Retirer « … » ». On ne veut pas d'elles ici.
    name: (nom: string) => nom.includes(enonce) && !/^(Avancer|Reculer|Retirer)/.test(nom),
  }) as HTMLButtonElement;
}

/** Le panneau d'ordre de passage. */
function ordre() {
  return screen.getByRole('list');
}

/* --------------------------------------------------------------- le tri */

describe('La banque', () => {
  it('trie par taux d’échec décroissant, comme le pied l’annonce', async () => {
    await monter();

    const enonces = screen
      .getAllByRole('button', { pressed: false })
      .map((bouton) => bouton.textContent ?? '')
      .filter((texte) => texte.includes('% d’échec'));

    // q1 (80 %) avant q3 (60 %) avant q2 (20 %) avant q4 (10 %).
    expect(enonces[0]).toContain('Durée minimale');
    expect(enonces.at(-1)).toContain('assistants dentaires');
  });

  it('groupe par formation et compte les publiées', async () => {
    await monter();
    expect(screen.getByRole('heading', { name: 'Formats et modalités' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Urgences au cabinet dentaire' })).toBeTruthy();
  });

  it('filtre sur l’énoncé', async () => {
    await monter();
    fireEvent.change(screen.getByLabelText('Rechercher une question'), {
      target: { value: 'RPPS' },
    });

    await waitFor(() => expect(screen.queryByText(/Durée minimale/)).toBeNull());
    expect(screen.getByText(/assistants dentaires/)).toBeTruthy();
  });
});

/* ------------------------------------------------------- le rang de passage */

describe('Le rang de passage', () => {
  it('inscrit dans la case le rang de sélection, pas la position dans la liste', async () => {
    await monter();

    // On coche la moins ratée en premier : elle doit porter le 1.
    fireEvent.click(ligne('Les assistants dentaires ont un RPPS.'));
    fireEvent.click(ligne('Durée minimale d’un e-learning indemnisé ?'));

    await waitFor(() =>
      expect(ligne('Les assistants dentaires ont un RPPS.').textContent).toContain('1'),
    );
    expect(ligne('Durée minimale d’un e-learning indemnisé ?').textContent).toContain('2');
  });

  it('compte les retenues en tête de l’étape', async () => {
    await monter();
    fireEvent.click(ligne('Durée minimale d’un e-learning indemnisé ?'));
    expect(await screen.findByText(/4 servies, 1 retenues/)).toBeTruthy();
  });

  it('décoche et rend son rang', async () => {
    await monter();
    const cible = 'Durée minimale d’un e-learning indemnisé ?';
    fireEvent.click(ligne(cible));
    await waitFor(() => expect(ligne(cible).getAttribute('aria-pressed')).toBe('true'));

    fireEvent.click(ligne(cible));
    await waitFor(() => expect(ligne(cible).getAttribute('aria-pressed')).toBe('false'));
  });
});

/* ----------------------------------------------------- la formation entière */

describe('Prendre une formation entière', () => {
  it('ajoute le groupe à la fin sans renuméroter les autres', async () => {
    await monter();

    // Une question d'une autre formation d'abord : elle garde le rang 1.
    fireEvent.click(ligne('Le présentiel se réserve la veille.'));
    await waitFor(() =>
      expect(ligne('Le présentiel se réserve la veille.').textContent).toContain('1'),
    );

    // Deux formations, donc deux boutons « Tout prendre » : on vise l'autre
    // groupe, pour vérifier que le rang déjà attribué ne bouge pas.
    const boutons = screen.getAllByRole('button', { name: /Tout prendre/ });
    fireEvent.click(boutons[boutons.length - 1] as HTMLElement);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Formation entière retenue/ })).toBeTruthy(),
    );
    // Le rang 1 n'a pas bougé.
    expect(ligne('Le présentiel se réserve la veille.').textContent).toContain('1');
  });

  it('rend la formation entière quand on reclique', async () => {
    await monter();
    const prendre = screen.getAllByRole('button', { name: /Tout prendre/ })[0] as HTMLElement;
    fireEvent.click(prendre);

    const rendreTout = await screen.findByRole('button', {
      name: /Formation entière retenue/,
    });
    fireEvent.click(rendreTout);

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Formation entière retenue/ })).toBeNull(),
    );
  });
});

/* -------------------------------------------------------------- l'ordre */

describe('L’ordre de passage', () => {
  it('se réordonne au clavier, sans glisser-déposer', async () => {
    await monter();
    fireEvent.click(ligne('Durée minimale d’un e-learning indemnisé ?'));
    fireEvent.click(ligne('Le présentiel se réserve la veille.'));

    await waitFor(() => expect(within(ordre()).getAllByRole('listitem')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: /Avancer « Le présentiel/ }));

    await waitFor(() =>
      expect(ligne('Le présentiel se réserve la veille.').textContent).toContain('1'),
    );
  });

  it('retire une question depuis le panneau', async () => {
    await monter();
    fireEvent.click(ligne('Durée minimale d’un e-learning indemnisé ?'));
    await waitFor(() => expect(within(ordre()).getAllByRole('listitem')).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: /Retirer « Durée minimale/ }));

    await waitFor(() =>
      expect(
        ligne('Durée minimale d’un e-learning indemnisé ?').getAttribute('aria-pressed'),
      ).toBe('false'),
    );
  });
});

/* ---------------------------------------------------------- le chronomètre */

describe('Le chronomètre', () => {
  it('estime la durée à partir de la cadence', async () => {
    await monter();
    fireEvent.click(ligne('Durée minimale d’un e-learning indemnisé ?'));
    fireEvent.click(ligne('Le présentiel se réserve la veille.'));

    // 2 × (30 + 45) = 150 s → 3 min.
    expect(await screen.findByText('3 min')).toBeTruthy();
    expect(screen.getByText('estimées')).toBeTruthy();
  });

  it('suit le changement de cadence', async () => {
    await monter();
    fireEvent.click(ligne('Durée minimale d’un e-learning indemnisé ?'));
    fireEvent.click(screen.getByRole('button', { name: '60 s' }));

    // 1 × (60 + 45) = 105 s → 2 min.
    expect(await screen.findByText('2 min')).toBeTruthy();
  });

  /*
   * **Le cas qui compte.** « 0 min » a l'aplomb d'un chiffre juste ; « libre »
   * dit ce qui est vrai — on passe à la suivante quand on le décide.
   */
  it('n’annonce aucune durée sans chronomètre', async () => {
    await monter();
    fireEvent.click(ligne('Durée minimale d’un e-learning indemnisé ?'));
    fireEvent.click(screen.getByLabelText('Ne pas chronométrer cette séance'));

    expect(await screen.findByText('libre')).toBeTruthy();
    expect(screen.getByText('durée')).toBeTruthy();
    expect(screen.queryByText(/min$/)).toBeNull();
  });

  it('éteint les cadences sans les cacher', async () => {
    await monter();
    fireEvent.click(screen.getByLabelText('Ne pas chronométrer cette séance'));

    const cadence = screen.getByRole('button', { name: '30 s' }) as HTMLButtonElement;
    await waitFor(() => expect(cadence.disabled).toBe(true));
    expect(cadence.getAttribute('aria-pressed')).toBe('false');
  });
});

/* ------------------------------------------------------ « déjà posée » */

describe('L’avertissement « déjà posée »', () => {
  function seance(statut: Session['statut'], questionIds: string[]): Session {
    return {
      id: 's1',
      code: 'JEUDI7',
      titre: 'Séance',
      description: '',
      animateurNom: 'Noémie',
      questionIds,
      indexCourant: 0,
      revelee: false,
      demarree: statut !== 'attente',
      verrouillee: false,
      statut,
      animateurUid: 'uid-noemie',
      repartition: [],
      repondants: 0,
      effectifAttendu: 0,
      dureeQuestionSecondes: 30,
      questionOuverteLeMs: null,
      creeeLeMs: Date.parse('2026-03-05T10:00:00Z'),
      ouverteLeMs: Date.parse('2026-03-05T10:00:00Z'),
      termineeLeMs: Date.parse('2026-03-05T10:20:00Z'),
      presentsFinal: 9,
    };
  }

  it('signale une question déjà jouée', async () => {
    mesSeances.mockResolvedValue([seance('terminee', ['q1'])]);
    await monter();
    expect(await screen.findByText(/Posée le 5 mars/)).toBeTruthy();
  });

  /*
   * Une séance préparée n'a pas encore été jouée : l'avertissement porterait
   * sur un futur, et découragerait de composer deux séances d'affilée.
   */
  it('ne signale pas une question seulement préparée', async () => {
    mesSeances.mockResolvedValue([seance('attente', ['q1'])]);
    await monter();
    expect(screen.queryByText(/Posée le/)).toBeNull();
  });
});

/* ------------------------------------------------------------ l'écriture */

describe('Enregistrer et lancer', () => {
  it('n’enregistre rien sans question retenue', async () => {
    await monter();
    const lancer = screen.getByRole('button', {
      name: /Lancer la séance/,
    }) as HTMLButtonElement;
    expect(lancer.disabled).toBe(true);
  });

  /*
   * **Un seul chemin d'ouverture.** Composer et lancer passe par
   * `preparerEtLancer`, qui prépare puis appelle `lancerSeance` — le même
   * geste que le bouton « Lancer » de la liste. Écrire directement une séance
   * ouverte aurait créé un second chemin, qui aurait divergé.
   */
  it('lance en préparant d’abord, jamais en écrivant une séance ouverte', async () => {
    await monter();
    fireEvent.click(ligne('Durée minimale d’un e-learning indemnisé ?'));
    fireEvent.click(screen.getByRole('button', { name: /Lancer la séance/ }));

    await waitFor(() => expect(preparerEtLancer).toHaveBeenCalledOnce());
    expect(creerSession).not.toHaveBeenCalled();
    expect(pousser).toHaveBeenCalledWith('/animer');
  });

  /**
   * **On refuse de lancer pendant qu'une séance tourne, et on met le geste à
   * portée.**
   *
   * Deux séances vivantes se disputent l'écran d'animation, et l'ancien code
   * reste rejoignable. Clore la précédente automatiquement aurait réglé ça —
   * mais on ne termine pas une séance sans que personne ne l'ait demandé : son
   * classement partirait avec.
   */
  describe('quand une séance tourne déjà', () => {
    function seanceVivante(): Session {
      return {
        id: 's-en-cours',
        titre: 'Séance du jeudi',
        questionIds: ['q1', 'q2'],
        indexCourant: 1,
        demarree: true,
        statut: 'encours',
      } as Session;
    }

    it('refuse de lancer, et nomme celle qui bloque', async () => {
      maSessionEnCours.mockResolvedValue(seanceVivante());
      await monter();
      fireEvent.click(ligne('Durée minimale d’un e-learning indemnisé ?'));
      fireEvent.click(screen.getByRole('button', { name: /Lancer la séance/ }));

      expect(
        await screen.findByText(/Une séance est déjà en cours : « Séance du jeudi »/),
      ).toBeTruthy();
      expect(preparerEtLancer).not.toHaveBeenCalled();
      expect(pousser).not.toHaveBeenCalled();
    });

    /* **Le geste est ici, pas dans un autre écran.** Renvoyer vers la liste
       ferait perdre la composition en cours. */
    it('offre les deux issues sur place', async () => {
      maSessionEnCours.mockResolvedValue(seanceVivante());
      await monter();
      fireEvent.click(ligne('Durée minimale d’un e-learning indemnisé ?'));
      fireEvent.click(screen.getByRole('button', { name: /Lancer la séance/ }));
      await screen.findByText(/Une séance est déjà en cours/);

      fireEvent.click(screen.getByRole('button', { name: /Arrêter la séance/ }));

      expect(await screen.findByRole('dialog')).toBeTruthy();
      expect(screen.getByRole('button', { name: /Terminer/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Abandonner/ })).toBeTruthy();
    });

    it('enregistre sans lancer, même pendant qu’une séance tourne', async () => {
      maSessionEnCours.mockResolvedValue(seanceVivante());
      await monter();
      fireEvent.click(ligne('Durée minimale d’un e-learning indemnisé ?'));
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et fermer' }));

      /* Préparer n'ouvre rien : aucune raison de le refuser. */
      await waitFor(() => expect(creerSession).toHaveBeenCalledOnce());
      expect(screen.queryByText(/Une séance est déjà en cours/)).toBeNull();
    });

    /* La vérification a lieu au clic, pas au montage : Noémie compose pendant
       dix minutes, et la séance d'à côté peut s'ouvrir entretemps. */
    it('vérifie au moment du clic, pas à l’ouverture de l’écran', async () => {
      await monter();
      fireEvent.click(ligne('Durée minimale d’un e-learning indemnisé ?'));

      maSessionEnCours.mockResolvedValue(seanceVivante());
      fireEvent.click(screen.getByRole('button', { name: /Lancer la séance/ }));

      expect(await screen.findByText(/Une séance est déjà en cours/)).toBeTruthy();
      expect(preparerEtLancer).not.toHaveBeenCalled();
    });
  });

  it('enregistre sans lancer, et revient à la liste', async () => {
    await monter();
    fireEvent.click(ligne('Durée minimale d’un e-learning indemnisé ?'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et fermer' }));

    await waitFor(() => expect(creerSession).toHaveBeenCalledOnce());
    expect(preparerEtLancer).not.toHaveBeenCalled();
    expect(pousser).toHaveBeenCalledWith('/admin/session');
  });

  it('dit que les règles ont refusé, plutôt qu’une panne anonyme', async () => {
    creerSession.mockRejectedValue(Object.assign(new Error('non'), {
      code: 'permission-denied',
    }));
    await monter();
    fireEvent.click(ligne('Durée minimale d’un e-learning indemnisé ?'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et fermer' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('règles');
  });
});
