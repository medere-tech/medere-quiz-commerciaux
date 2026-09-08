import { describe, expect, it } from 'vitest';

import {
  generateurAleatoire,
  poids,
  tirerRattrapage,
  tirerSerie,
  type EtatQuestion,
} from '@/lib/serie/tirage';
import {
  ETOILES_PAR_SEUIL,
  corriger,
  etoilesGagnees,
  etatOption,
  libelleSeuilsEtoiles,
  memesEnsembles,
} from '@/lib/serie/verdict';
import type { Question } from '@/lib/questions/depot';

/**
 * Ce que ces tests protègent : les quatre poids du README, et la règle du
 * QCM exact. Ce sont des décisions pédagogiques, pas des détails
 * d'implémentation — une pondération qui dérive fait revenir les mauvaises
 * questions, et personne ne s'en aperçoit avant des semaines.
 */

function etat(partiel: Partial<EtatQuestion> & { id: string }): EtatQuestion {
  return { reussies: 0, derniereRatee: false, dejaVue: false, ...partiel };
}

/** Suite déterministe : le tirage est aléatoire, les tests ne le sont pas. */
function suite(valeurs: number[]): () => number {
  let index = 0;
  return () => valeurs[index++ % valeurs.length]!;
}

describe('poids', () => {
  it('applique les quatre valeurs du README', () => {
    expect(poids(etat({ id: 'a' }))).toBe(3);
    expect(poids(etat({ id: 'b', dejaVue: true, derniereRatee: true }))).toBe(6);
    expect(poids(etat({ id: 'c', dejaVue: true, reussies: 1 }))).toBe(1.2);
    expect(poids(etat({ id: 'd', dejaVue: true, reussies: 2 }))).toBe(0.4);
    expect(poids(etat({ id: 'e', dejaVue: true, reussies: 7 }))).toBe(0.4);
  });

  it('donne la priorité au dernier échec, même sur une question souvent réussie', () => {
    // Une question réussie dix fois puis ratée doit revenir vite : c'est
    // l'échec le plus récent qui compte, pas le cumul.
    expect(poids(etat({ id: 'f', dejaVue: true, reussies: 10, derniereRatee: true }))).toBe(6);
  });
});

describe('tirerSerie', () => {
  const quinze = Array.from({ length: 15 }, (_, i) => etat({ id: `q${i}` }));

  it('tire dix questions quand il y en a assez', () => {
    expect(tirerSerie(quinze, 10, suite([0.5])).length).toBe(10);
  });

  it('ne tire jamais deux fois la même question', () => {
    const tirage = tirerSerie(quinze, 10, suite([0.1, 0.9, 0.5, 0.3, 0.7]));

    expect(new Set(tirage).size).toBe(tirage.length);
  });

  it('rend une série plus courte plutôt que de répéter', () => {
    const trois = quinze.slice(0, 3);
    const tirage = tirerSerie(trois, 10, suite([0.5]));

    expect(tirage).toHaveLength(3);
    expect(new Set(tirage).size).toBe(3);
  });

  it('rend une série vide quand rien n’est disponible', () => {
    expect(tirerSerie([], 10, suite([0.5]))).toEqual([]);
  });

  it('sert d’abord la question ratée quand le hasard vise le début', () => {
    // Poids 6 contre 3 : la ratée occupe les deux tiers de la roue.
    const candidats = [
      etat({ id: 'ratee', dejaVue: true, derniereRatee: true }),
      etat({ id: 'neuve' }),
    ];

    expect(tirerSerie(candidats, 1, suite([0.01]))[0]).toBe('ratee');
  });

  it('finit par servir la question la moins pondérée si le hasard va au bout', () => {
    const candidats = [
      etat({ id: 'maitrisee', dejaVue: true, reussies: 3 }),
      etat({ id: 'neuve' }),
    ];

    // Un tirage proche de 1 parcourt toute la roue et atteint la dernière.
    expect(tirerSerie(candidats, 1, suite([0.99]))[0]).toBe('neuve');
  });
});

describe('tirerRattrapage', () => {
  it('ne retient que les questions dont la dernière tentative est un échec', () => {
    const candidats = [
      etat({ id: 'ratee', dejaVue: true, derniereRatee: true }),
      etat({ id: 'reussie', dejaVue: true, reussies: 1 }),
      etat({ id: 'neuve' }),
      etat({ id: 'ratee2', dejaVue: true, derniereRatee: true }),
    ];

    expect(tirerRattrapage(candidats, 10, suite([0.5])).sort()).toEqual(['ratee', 'ratee2']);
  });

  it('rend une liste vide quand rien n’a été raté', () => {
    expect(tirerRattrapage([etat({ id: 'neuve' })], 10, suite([0.5]))).toEqual([]);
  });
});

describe('etoilesGagnees', () => {
  it('applique les trois seuils du README', () => {
    expect(etoilesGagnees(10, 10)).toBe(3);
    expect(etoilesGagnees(9, 10)).toBe(3);
    expect(etoilesGagnees(8, 10)).toBe(2);
    expect(etoilesGagnees(7, 10)).toBe(2);
    expect(etoilesGagnees(6, 10)).toBe(1);
    expect(etoilesGagnees(5, 10)).toBe(1);
    expect(etoilesGagnees(4, 10)).toBe(0);
    expect(etoilesGagnees(0, 10)).toBe(0);
  });

  it('raisonne en taux, donc vaut aussi pour une série courte', () => {
    expect(etoilesGagnees(3, 3)).toBe(3);
    // Deux sur trois font 66,7 % : sous le seuil de 70 %, donc une seule
    // étoile. Une série courte n'est pas plus indulgente qu'une longue.
    expect(etoilesGagnees(2, 3)).toBe(1);
    expect(etoilesGagnees(1, 3)).toBe(0);
    expect(etoilesGagnees(4, 5)).toBe(2);
  });

  it('ne divise pas par zéro', () => {
    expect(etoilesGagnees(0, 0)).toBe(0);
  });
});

describe('libelleSeuilsEtoiles', () => {
  it('annonce à l’écran les seuils que le code applique', () => {
    expect(libelleSeuilsEtoiles()).toBe(
      '3 étoiles dès 90 %, 2 dès 70 %, 1 dès 50 % de bonnes réponses.',
    );
  });

  it('cite chaque palier, pour qu’un seuil ajouté ne reste pas muet', () => {
    // La phrase se déduit des constantes : c'est ce qui interdit d'annoncer
    // 90 % et d'en appliquer 80.
    const phrase = libelleSeuilsEtoiles();
    for (const palier of ETOILES_PAR_SEUIL) {
      expect(phrase).toContain(`${Math.round(palier.seuil * 100)} %`);
      expect(phrase).toContain(String(palier.etoiles));
    }
  });
});

describe('correction d’un QCM', () => {
  const question = {
    id: 'q1',
    type: 'qcm',
    contexte: '',
    enonce: 'Quels publics ?',
    options: { o1: 'Médecins', o2: 'Gynécologues', o3: 'Dentistes' },
    ordreOptions: ['o1', 'o2', 'o3'],
    bonnesReponses: ['o1', 'o2'],
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
  } as unknown as Question;

  it('accepte l’ensemble exact, quel que soit l’ordre', () => {
    expect(corriger(question, ['o2', 'o1']).correcte).toBe(true);
  });

  it('refuse une réponse partielle', () => {
    const resultat = corriger(question, ['o1']);

    expect(resultat.correcte).toBe(false);
    expect(resultat.partielle).toBe(true);
  });

  it('montre ce qui manquait et ce qui était en trop', () => {
    const resultat = corriger(question, ['o1', 'o3']);

    expect(resultat.etats).toEqual({ o1: 'juste', o2: 'manquee', o3: 'fausse' });
  });

  it('nomme l’écart dans le titre, plutôt que de dire « faux »', () => {
    expect(corriger(question, ['o1']).titre).toBe('Il manquait une réponse');
    expect(corriger(question, ['o1', 'o2', 'o3']).titre).toBe('Réponse incorrecte');
    expect(corriger(question, ['o3']).titre).toContain('en trop');
    expect(corriger(question, ['o1', 'o2']).titre).toBe('Bonne réponse');
  });

  it('ne parle pas de réponse manquante quand une seule était attendue', () => {
    // Sur un vrai ou faux, se tromper produit mécaniquement « une manquante
    // et une en trop » : exact, et absurde à lire.
    const vraiFaux = {
      ...question,
      options: { o1: 'Vrai', o2: 'Faux' },
      ordreOptions: ['o1', 'o2'],
      bonnesReponses: ['o1'],
    } as unknown as Question;

    expect(corriger(vraiFaux, ['o2']).titre).toBe('Ce n’était pas la bonne réponse');
    expect(corriger(vraiFaux, ['o1']).titre).toBe('Bonne réponse');
  });

  it('marque toutes les options comme inertes si rien n’est coché', () => {
    const resultat = corriger(question, []);

    expect(resultat.correcte).toBe(false);
    expect(resultat.partielle).toBe(false);
    expect(resultat.etats.o3).toBe('inerte');
  });
});

describe('outils de comparaison', () => {
  it('compare des ensembles, pas des listes', () => {
    expect(memesEnsembles(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(memesEnsembles(['a'], ['a', 'b'])).toBe(false);
    expect(memesEnsembles([], [])).toBe(true);
  });

  it('classe chaque option dans un des quatre états', () => {
    expect(etatOption('o1', ['o1'], ['o1'])).toBe('juste');
    expect(etatOption('o2', [], ['o2'])).toBe('manquee');
    expect(etatOption('o3', ['o3'], [])).toBe('fausse');
    expect(etatOption('o4', [], [])).toBe('inerte');
  });
});

describe('generateurAleatoire', () => {
  it('rend la même suite pour la même graine', () => {
    const a = generateurAleatoire(1234);
    const b = generateurAleatoire(1234);

    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('rend des suites différentes pour des graines différentes', () => {
    expect(generateurAleatoire(1)()).not.toBe(generateurAleatoire(2)());
  });

  it('reste dans l’intervalle attendu', () => {
    const hasard = generateurAleatoire(7);
    for (let i = 0; i < 200; i += 1) {
      const valeur = hasard();
      expect(valeur).toBeGreaterThanOrEqual(0);
      expect(valeur).toBeLessThan(1);
    }
  });

  it('rend une série identique à graine identique', () => {
    // C'est la propriété qui compte : recalculer le tirage ne doit jamais
    // rebattre les questions sous les doigts du commercial.
    const candidats = Array.from({ length: 20 }, (_, i) => etat({ id: `q${i}` }));

    const premiere = tirerSerie(candidats, 10, generateurAleatoire(99));
    const seconde = tirerSerie(candidats, 10, generateurAleatoire(99));

    expect(premiere).toEqual(seconde);
  });
});
