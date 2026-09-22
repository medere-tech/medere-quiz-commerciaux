// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { question } from './aide';
import type { Question } from '@/lib/questions/lecture';
import { fausseAuth, fausseIntention, fausseRequete, fauxRouteur } from '../aide/faux';

/**
 * 02, 03 et 04 · La série, de la première question au décompte final.
 *
 * **C'est là que le commercial passe son temps**, et c'est là qu'une règle mal
 * affichée se paie en points. La correction en particulier : elle est le seul
 * moment où l'on apprend quelque chose, et le seul où une erreur d'affichage
 * enseigne le contraire de ce qu'il faut retenir.
 *
 * **Ce que ces tests vérifient et que rien ne vérifiait :** que l'ensemble
 * sélectionné parte entier, qu'une réponse partielle soit comptée fausse **et
 * montre ce qui manquait**, que la panne d'écriture n'empêche pas d'avancer,
 * que le clavier fasse le même travail que la souris, et qu'on ne quitte pas
 * une série engagée sans confirmation.
 *
 * Interrogation par rôle et par texte visible, jamais par classe.
 */

/* ------------------------------------------------ le monde autour de l'écran */

const enregistrerReponse =
  vi.fn<typeof import('@/lib/serie/depot').enregistrerReponse>();
const crediterSerie = vi.fn<typeof import('@/lib/serie/depot').crediterSerie>();

/**
 * Une progression neuve, **de la forme complète**.
 *
 * Elle en portait deux champs sur quatre : `assiduite` et `recompenses`
 * manquaient. Le jour où l'écran les aurait lus, le test aurait vu `undefined`
 * et serait passé quand même — un test qui passe sur un défaut est pire qu'un
 * test absent. Le typage du faux l'interdit désormais.
 */
function progressionVide(): import('@/lib/serie/depot').Progression {
  return {
    etoiles: 0,
    seriesTerminees: 0,
    assiduite: { dernierJour: '', serie: 0, record: 0, semaine: [] },
    recompenses: {},
  };
}
const pousser = vi.fn();

/*
 * **Le faux est typé sur le vrai module.** `vi.mock(import('…'))` — la forme à
 * promesse plutôt qu'à chaîne — fait exiger à TypeScript un `Partial` du module
 * remplacé : une fonction qui ne rendrait pas la bonne forme ne compile pas.
 * C'est ce qui manquait, et un faux commode avait déjà coûté un filtre cassé.
 * Voir `CLAUDE.md`.
 */
vi.mock(import('@/lib/serie/depot'), async (original) => {
  const vrai = await original();
  return {
    ...vrai,
    enregistrerReponse,
    crediterSerie,
    // Une Map, comme le vrai dépôt : `etatsDesQuestions` fait `.get()` dessus.
    chargerMesEtats: async () => new Map(),
    chargerProgression: async () => progressionVide(),
  };
});

vi.mock(import('@/lib/firebase/client'), () => ({
  authentification: () => fausseAuth({ uid: 'uid-jordan', displayName: 'Jordan' }),
}));

/* L'adresse est tenue par le test : c'est elle qui porte le mode. */
let adresse = fausseRequete();

vi.mock(import('next/navigation'), () => ({
  useRouter: () => fauxRouteur({ push: pousser }),
  usePathname: () => '/serie',
  useSearchParams: () => adresse,
}));

vi.mock(import('@/lib/navigation/intention'), () => fausseIntention());

const { Serie } = await import('@/composants/parcours/Serie');

/** Assez de questions pour une série entière, toutes du même moule. */
function banque(nombre = 12): Question[] {
  return Array.from({ length: nombre }, (_, i) =>
    question({
      id: `q${i}`,
      enonce: `Énoncé numéro ${i} ?`,
      options: { a: `Alpha ${i}`, b: `Bravo ${i}`, c: `Charlie ${i}`, d: `Delta ${i}` },
      bonnesReponses: ['a', 'c'],
      explication: `Explication numéro ${i}.`,
    }),
  );
}

const referentiel = (questions: Question[]) => ({
  questions,
  formations: [
    {
      id: 'f-1',
      airtableId: 'rec1',
      numeroActionDpc: '99000001',
      nom: 'Parodontie clinique',
      cibles: ['Chirurgien-dentiste'],
      format: 'Présentiel',
      modalite: 'Formation continue',
      blocsCertification: ['1'],
      dureeTotale: '14 heures',
      urlWebflow: '',
      actif: true,
      syncLe: null,
    },
  ],
});

async function ouvrirLaSerie(questions = banque()): Promise<void> {
  const { render } = await import('@testing-library/react');
  await act(async () => {
    render(<Serie referentiel={referentiel(questions)} />);
  });
  // La première question arrive après la lecture des états et de la progression.
  await waitFor(() => expect(screen.getByRole('button', { name: /valider/i })).toBeTruthy());
}

/** L'énoncé affiché, quel qu'il soit : la série tire, le test ne choisit pas. */
function enonceAffiche(): string {
  return screen.getByRole('heading', { level: 1 }).textContent ?? '';
}

/** Les libellés d'options de la question à l'écran. */
function optionsAffichees(): string[] {
  const numero = enonceAffiche().match(/numéro (\d+)/)?.[1] ?? '0';
  return [`Alpha ${numero}`, `Bravo ${numero}`, `Charlie ${numero}`, `Delta ${numero}`];
}

beforeEach(() => {
  adresse = fausseRequete();
  enregistrerReponse.mockResolvedValue(undefined);
  /* Le vrai `crediterSerie` rend les récompenses **nouvellement** obtenues, et
     la fin de série les annonce. Le faux rendait `undefined` : l'écran aurait
     appelé `.includes` dessus le jour où une récompense serait tombée. */
  crediterSerie.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/* ======================================================== avant de répondre */

describe('la question', () => {
  it('annonce qu’un QCM attend plusieurs réponses, et ce qu’il en coûte', async () => {
    await ouvrirLaSerie();

    // La règle la plus contre-intuitive de l'outil, dite avant de cliquer.
    expect(screen.getByText(/plusieurs réponses attendues/i)).toBeTruthy();
    expect(screen.getByText(/incomplète est comptée fausse/i)).toBeTruthy();
  });

  it('dit « une seule réponse » sur un vrai ou faux', async () => {
    await ouvrirLaSerie(
      banque(12).map((q) => ({ ...q, type: 'vf' as const, bonnesReponses: ['a'] })),
    );

    expect(screen.getByText(/une seule réponse/i)).toBeTruthy();
  });

  it('décrit le groupe d’options pour les technologies d’assistance', async () => {
    await ouvrirLaSerie();

    const groupe = screen.getByRole('group', { name: /réponses possibles/i });
    const decrit = groupe.getAttribute('aria-describedby');
    expect(document.getElementById(decrit ?? '')?.textContent).toMatch(/plusieurs réponses/i);
  });

  it('compte les réponses cochées à mesure', async () => {
    await ouvrirLaSerie();
    const [alpha, bravo] = optionsAffichees();

    fireEvent.click(screen.getByText(alpha!));
    expect(screen.getByText(/1 cochée/)).toBeTruthy();

    fireEvent.click(screen.getByText(bravo!));
    expect(screen.getByText(/2 cochées/)).toBeTruthy();
  });

  it('ne valide pas une réponse vide', async () => {
    await ouvrirLaSerie();

    fireEvent.click(screen.getByRole('button', { name: /valider/i }));

    await waitFor(() => expect(enregistrerReponse).not.toHaveBeenCalled());
  });

  it('se coche au clavier, sans souris', async () => {
    await ouvrirLaSerie();

    // Un commercial pressé doit pouvoir enchaîner une série au clavier.
    fireEvent.keyDown(window, { key: '1' });

    expect(screen.getByText(/1 cochée/)).toBeTruthy();
  });
});

/* ============================================================= la correction */

describe('la correction', () => {
  it('compte une réponse partielle comme fausse et montre ce qui manquait', async () => {
    await ouvrirLaSerie();
    const [alpha, , charlie] = optionsAffichees();

    // Une seule des deux bonnes réponses : c'est faux, et l'écran doit dire
    // laquelle manquait. C'est la règle du QCM multiple.
    fireEvent.click(screen.getByText(alpha!));
    fireEvent.click(screen.getByRole('button', { name: /valider/i }));

    await waitFor(() => expect(enregistrerReponse).toHaveBeenCalledTimes(1));
    expect(enregistrerReponse.mock.calls[0]).toEqual(
      expect.arrayContaining([expect.arrayContaining(['a']), false]),
    );

    // L'option oubliée est signalée sur elle-même, pas dans une phrase
    // générique : c'est ce qu'on regarde en premier.
    await waitFor(() => expect(screen.getByText(/manquait|manquée/i)).toBeTruthy());
    expect(screen.getByText(charlie!)).toBeTruthy();
  });

  it('accepte l’ensemble exact', async () => {
    await ouvrirLaSerie();
    const [alpha, , charlie] = optionsAffichees();

    fireEvent.click(screen.getByText(alpha!));
    fireEvent.click(screen.getByText(charlie!));
    fireEvent.click(screen.getByRole('button', { name: /valider/i }));

    await waitFor(() => expect(enregistrerReponse).toHaveBeenCalledTimes(1));
    expect(enregistrerReponse.mock.calls[0]).toEqual(
      expect.arrayContaining([expect.arrayContaining(['a', 'c']), true]),
    );
  });

  it('affiche l’explication, qui est la seule chose qu’on retient', async () => {
    await ouvrirLaSerie();
    const numero = enonceAffiche().match(/numéro (\d+)/)?.[1] ?? '0';

    fireEvent.click(screen.getByText(optionsAffichees()[0]!));
    fireEvent.click(screen.getByRole('button', { name: /valider/i }));

    expect(await screen.findByText(`Explication numéro ${numero}.`)).toBeTruthy();
  });

  it('avance quand même si l’enregistrement échoue, en le disant', async () => {
    enregistrerReponse.mockRejectedValue(new Error('réseau'));
    await ouvrirLaSerie();

    fireEvent.click(screen.getByText(optionsAffichees()[0]!));
    fireEvent.click(screen.getByRole('button', { name: /valider/i }));

    // Refuser d'avancer punirait le commercial d'une panne de réseau. Mais on
    // ne lui laisse pas croire que sa réponse compte.
    expect(await screen.findByText(/n’a pas pu être enregistrée/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /question suivante|continuer|suivante/i })).toBeTruthy();
  });

  it('passe à la question suivante et remet le choix à zéro', async () => {
    await ouvrirLaSerie();
    const premier = enonceAffiche();

    fireEvent.click(screen.getByText(optionsAffichees()[0]!));
    fireEvent.click(screen.getByRole('button', { name: /valider/i }));
    await screen.findByRole('button', { name: /question suivante|continuer|suivante/i });

    fireEvent.click(screen.getByRole('button', { name: /question suivante|continuer|suivante/i }));

    await waitFor(() => expect(enonceAffiche()).not.toBe(premier));
    expect(screen.getByText(/0 cochée|plusieurs réponses attendues/i)).toBeTruthy();
  });
});

/* ================================================================ quitter */

describe('quitter une série', () => {
  it('part sans rien demander tant que rien n’est engagé', async () => {
    await ouvrirLaSerie();

    fireEvent.click(screen.getByRole('button', { name: /quitter/i }));

    // Rien n'est engagé tant qu'aucune réponse n'est validée : on ne demande à
    // confirmer que ce qui coûte quelque chose.
    await waitFor(() => expect(pousser).toHaveBeenCalled());
  });

  it('demande confirmation une fois une réponse validée', async () => {
    await ouvrirLaSerie();

    fireEvent.click(screen.getByText(optionsAffichees()[0]!));
    fireEvent.click(screen.getByRole('button', { name: /valider/i }));
    await screen.findByRole('button', { name: /question suivante|continuer|suivante/i });

    fireEvent.click(screen.getByRole('button', { name: /quitter/i }));

    await waitFor(() => expect(pousser).not.toHaveBeenCalled());
    // La conséquence est dite au moment du geste, pas dans une aide que
    // personne ne lit : abandonner coûte les étoiles de la série.
    expect(screen.getByText(/aucune étoile/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /quitter quand même/i })).toBeTruthy();
  });
});

/* ============================================================ état vide */

/* ============================================== « Retravailler » une question */

/**
 * Une question retravaillée depuis « À revoir ».
 *
 * **Ce que ces tests gardent est une décision de produit, pas un détail.** Une
 * révision ne crédite rien — ni étoile, ni série terminée, ni jour d'assiduité.
 * Sans cette règle, le bouton serait une machine à étoiles : une question juste
 * vaut cent pour cent, et dix clics vaudraient dix séries. Et la réponse, elle,
 * doit compter : c'est tout l'intérêt de retravailler.
 */
describe('retravailler une question', () => {
  async function ouvrirLaRevision(id = 'q3'): Promise<void> {
    adresse = fausseRequete(`question=${id}`);
    const { render } = await import('@testing-library/react');
    await act(async () => {
      render(<Serie referentiel={referentiel(banque())} />);
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /valider/i })).toBeTruthy());
  }

  it('pose la question nommée, et elle seule', async () => {
    await ouvrirLaRevision('q7');
    expect(enonceAffiche()).toContain('numéro 7');
    // Une seule question : la correction mène directement au résultat.
    fireEvent.click(screen.getByText('Alpha 7'));
    fireEvent.click(screen.getByRole('button', { name: /valider/i }));
    expect(await screen.findByRole('button', { name: /^Terminer$/ })).toBeTruthy();
  });

  it('enregistre la réponse', async () => {
    await ouvrirLaRevision('q7');
    fireEvent.click(screen.getByText('Alpha 7'));
    fireEvent.click(screen.getByText('Charlie 7'));
    fireEvent.click(screen.getByRole('button', { name: /valider/i }));

    await waitFor(() => expect(enregistrerReponse).toHaveBeenCalledTimes(1));
    expect(enregistrerReponse.mock.calls[0]).toEqual(
      expect.arrayContaining([expect.arrayContaining(['a', 'c']), true]),
    );
  });

  /* **Le test qui porte la décision.** */
  it('ne crédite ni étoile, ni série, ni jour d’assiduité', async () => {
    await ouvrirLaRevision('q7');
    fireEvent.click(screen.getByText('Alpha 7'));
    fireEvent.click(screen.getByText('Charlie 7'));
    fireEvent.click(screen.getByRole('button', { name: /valider/i }));

    fireEvent.click(await screen.findByRole('button', { name: /^Terminer$/ }));

    await waitFor(() => expect(screen.getByText('Révision enregistrée')).toBeTruthy());
    expect(crediterSerie).not.toHaveBeenCalled();
  });

  it('dit pourquoi rien n’est crédité, et renvoie à la liste', async () => {
    await ouvrirLaRevision('q7');
    fireEvent.click(screen.getByText('Alpha 7'));
    fireEvent.click(screen.getByText('Charlie 7'));
    fireEvent.click(screen.getByRole('button', { name: /valider/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^Terminer$/ }));

    expect(await screen.findByText(/ne compte pas comme une série/i)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /revenir à mes questions à revoir/i }),
    ).toBeTruthy();
  });

  /* Une adresse se modifie à la main, et une question peut être dépubliée
     entre l'ouverture de la liste et le clic. */
  it('ne montre pas un écran vide sur un identifiant inconnu', async () => {
    adresse = fausseRequete('question=q-inventee');
    const { render } = await import('@testing-library/react');
    await act(async () => {
      render(<Serie referentiel={referentiel(banque())} />);
    });

    expect(await screen.findByText(/n’est plus disponible/i)).toBeTruthy();
  });
});

describe('sans question à poser', () => {
  it('invite au lieu de constater', async () => {
    const { render } = await import('@testing-library/react');
    await act(async () => {
      render(<Serie referentiel={referentiel([])} />);
    });

    expect(await screen.findByText(/aucune question n’est publiée/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /revenir à l’accueil/i })).toBeTruthy();
  });
});
