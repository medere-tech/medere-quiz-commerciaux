import { describe, expect, it } from 'vitest';

import {
  avecNouvelles,
  IDS_RECOMPENSES,
  mesurerAssiduite,
  paliersAtteints,
  RECOMPENSES,
  vueDesRecompenses,
  type Mesures,
} from '@/lib/serie/recompenses';
import { apresUneSerie, type Assiduite } from '@/lib/serie/assiduite';

/**
 * Les récompenses — neuf paliers, et deux choses qui doivent tenir.
 *
 * **La première : une récompense ne se reprend pas.** C'est toute la raison de
 * les stocker plutôt que de les dériver. Un test le vérifie en faisant reculer
 * la mesure après l'obtention.
 *
 * **La seconde : la croissance est bornée par l'ensemble fermé.** Neuf entrées
 * au plus, quoi qu'il arrive, parce que la liste vit dans le code.
 */

function mesures(remplacements: Partial<Mesures> = {}): Mesures {
  return {
    formationsMaitrisees: 0,
    formationsSolides: 0,
    formationsTotal: 5,
    situationsJustes: 0,
    situationsVues: 0,
    situationsRatees: 0,
    serieJours: 0,
    joursActifsCetteSemaine: 0,
    ...remplacements,
  };
}

/* ------------------------------------------------------------- la liste */

describe('La liste des récompenses', () => {
  it('compte neuf paliers, tous distincts', () => {
    expect(RECOMPENSES).toHaveLength(9);
    expect(new Set(IDS_RECOMPENSES).size).toBe(9);
  });

  /*
   * **Les teintes de médaille sont réservées aux prix de séance.** Turquoise,
   * jaune et argent disent « Diamant », « Or », « Argent » sur l'accueil : une
   * récompense qui les emprunterait se lirait comme un trophée du jeudi. Deux
   * systèmes qui partagent une couleur sont deux systèmes qu'on confond.
   */
  it('n’emprunte jamais une teinte de médaille', () => {
    const medailles = ['#17BEBB', '#FECA45', '#DBD6CD'];
    for (const recompense of RECOMPENSES) {
      expect(medailles).not.toContain(recompense.teinte.toUpperCase());
    }
  });

  /*
   * **Un palier, jamais un trophée.**
   *
   * La règle n'est pas « ne jamais dire séance » — « première séance
   * collective » est bien un palier, et c'est celui de la maquette. Elle est :
   * une récompense ne nomme **ni un rang, ni une médaille**. C'est ce qui la
   * distingue d'un prix du jeudi, qui ne dit jamais autre chose.
   */
  it('ne nomme ni rang ni médaille', () => {
    const trophees = ['diamant', 'or ', 'argent', '1er', '2e', '3e', 'classement', 'podium'];
    for (const recompense of RECOMPENSES) {
      const libelle = recompense.libelle.toLowerCase();
      for (const mot of trophees) expect(libelle).not.toContain(mot);
    }
  });
});

/* ------------------------------------------------------------ les paliers */

describe('Les paliers atteints', () => {
  it('n’en accorde aucun à qui n’a rien fait', () => {
    expect(paliersAtteints(mesures())).toEqual([]);
  });

  it('accorde la formation maîtrisée dès la première', () => {
    expect(paliersAtteints(mesures({ formationsMaitrisees: 1 }))).toContain(
      'formation-maitrisee',
    );
  });

  it('accorde le catalogue solide quand toutes les formations y sont', () => {
    expect(
      paliersAtteints(mesures({ formationsSolides: 5, formationsTotal: 5 })),
    ).toContain('catalogue-solide');
    expect(
      paliersAtteints(mesures({ formationsSolides: 4, formationsTotal: 5 })),
    ).not.toContain('catalogue-solide');
  });

  /*
   * **Le cas qui rendrait le palier gratuit.** Sans plancher, « aucune erreur
   * sur les mises en situation » serait acquis d'avance par qui n'en a jamais
   * vu une seule.
   */
  it('n’accorde pas le sans-faute à qui n’a vu aucune mise en situation', () => {
    expect(paliersAtteints(mesures())).not.toContain('situations-sans-faute');
    expect(
      paliersAtteints(mesures({ situationsVues: 10, situationsRatees: 0 })),
    ).toContain('situations-sans-faute');
    expect(
      paliersAtteints(mesures({ situationsVues: 12, situationsRatees: 1 })),
    ).not.toContain('situations-sans-faute');
  });

  it('accorde les deux paliers de jours au bon moment', () => {
    expect(paliersAtteints(mesures({ serieJours: 10 }))).toContain('dix-jours');
    expect(paliersAtteints(mesures({ serieJours: 10 }))).not.toContain('vingt-jours');
    expect(paliersAtteints(mesures({ serieJours: 20 }))).toContain('vingt-jours');
  });

  /*
   * **Les récompenses d'évènement ne se mesurent jamais.** Une série sans faute
   * et une première séance se constatent au moment où elles arrivent ; les
   * rejouer depuis l'accueil les accorderait à tort ou jamais.
   */
  it('n’accorde jamais par la mesure une récompense d’évènement', () => {
    const tout = mesures({
      formationsMaitrisees: 5,
      formationsSolides: 5,
      situationsJustes: 50,
      situationsVues: 50,
      serieJours: 99,
      joursActifsCetteSemaine: 7,
    });
    expect(paliersAtteints(tout)).not.toContain('serie-parfaite');
    expect(paliersAtteints(tout)).not.toContain('premiere-seance');
  });
});

/* ----------------------------------------------------------- la carte */

describe('La carte des récompenses', () => {
  it('inscrit une nouvelle récompense au jour où elle est gagnée', () => {
    expect(avecNouvelles({}, ['dix-jours'], '2026-03-19')).toEqual({
      'dix-jours': '2026-03-19',
    });
  });

  /* La date est celle du jour où elle a été gagnée, pas du dernier jour où on
     l'a re-méritée. */
  it('ne réécrit jamais la date d’une récompense déjà obtenue', () => {
    const carte = avecNouvelles({ 'dix-jours': '2026-03-10' }, ['dix-jours'], '2026-03-19');
    expect(carte['dix-jours']).toBe('2026-03-10');
  });

  it('ne dépasse jamais le nombre de récompenses définies', () => {
    const carte = avecNouvelles({}, IDS_RECOMPENSES, '2026-03-19');
    expect(Object.keys(carte)).toHaveLength(9);
  });
});

/* ------------------------------------------------- ce que l'écran affiche */

describe('La vue des récompenses', () => {
  it('rend les neuf, obtenues ou non, dans l’ordre', () => {
    const vue = vueDesRecompenses({}, mesures());
    expect(vue).toHaveLength(9);
    expect(vue.every((recompense) => recompense.obtenueLe === null)).toBe(true);
  });

  /*
   * **Le test qui justifie de stocker plutôt que de dériver.**
   *
   * Le commercial a maîtrisé ses cinq formations, puis Noémie a publié une
   * question de plus : la mesure retombe à quatre sur six. Une récompense
   * dérivée s'évanouirait. Celle-ci reste, avec sa date.
   */
  it('garde une récompense obtenue quand la mesure retombe', () => {
    const carte = { 'catalogue-solide': '2026-03-12' };
    const apres = mesures({ formationsSolides: 4, formationsTotal: 6 });
    const vue = vueDesRecompenses(carte, apres);
    const solide = vue.find((recompense) => recompense.id === 'catalogue-solide')!;

    expect(solide.obtenueLe).toBe('2026-03-12');
    expect(paliersAtteints(apres)).not.toContain('catalogue-solide');
  });

  it('dit ce qu’il reste à faire tant que le palier n’est pas franchi', () => {
    const vue = vueDesRecompenses({}, mesures({ serieJours: 4 }));
    const dix = vue.find((recompense) => recompense.id === 'dix-jours')!;
    expect(dix.jaugeVue).toEqual({ valeur: 4, objectif: 10, reste: 'encore 6 jours' });
  });

  it('accorde le singulier au dernier jour qui manque', () => {
    const vue = vueDesRecompenses({}, mesures({ serieJours: 9 }));
    const dix = vue.find((recompense) => recompense.id === 'dix-jours')!;
    expect(dix.jaugeVue?.reste).toBe('encore 1 jour');
  });

  it('n’affiche aucune jauge pour une récompense d’évènement', () => {
    const vue = vueDesRecompenses({}, mesures());
    const parfaite = vue.find((recompense) => recompense.id === 'serie-parfaite')!;
    expect(parfaite.jaugeVue).toBeNull();
  });
});

/* --------------------------------------------- l'assiduité, telle qu'elle vaut */

/*
 * **Une jauge ne promet jamais un palier plus proche qu'il ne l'est.**
 *
 * Le document d'assiduité ne se corrige qu'à la série suivante : une série
 * rompue garde son compte, et la semaine garde les jours de la semaine passée.
 * Le 24 septembre 2026 est un jeudi, le 21 un lundi.
 */
describe('Les mesures d’assiduité', () => {
  const assiduite = (valeurs: Partial<Assiduite>): Assiduite => ({
    dernierJour: '',
    serie: 0,
    record: 0,
    semaine: [],
    ...valeurs,
  });
  const dixJours = (a: Assiduite, aujourdhui: string) =>
    vueDesRecompenses({}, mesures(mesurerAssiduite(a, aujourdhui))).find(
      (recompense) => recompense.id === 'dix-jours',
    )!.jaugeVue;

  it('compte les jours restants depuis la série du moment, pas depuis le record', () => {
    const a = assiduite({ dernierJour: '2026-09-24', serie: 2, record: 4 });
    expect(dixJours(a, '2026-09-24')).toEqual({ valeur: 2, objectif: 10, reste: 'encore 8 jours' });
  });

  it('repart de dix quand la série est rompue, même si le document dit autre chose', () => {
    const a = assiduite({ dernierJour: '2026-09-17', serie: 5, record: 5 });
    expect(mesurerAssiduite(a, '2026-09-24').serieJours).toBe(0);
    expect(dixJours(a, '2026-09-24')?.reste).toBe('encore 10 jours');
  });

  it('n’accorde pas un palier de jours sur un record ancien', () => {
    const a = assiduite({ dernierJour: '2026-09-24', serie: 3, record: 12 });
    expect(paliersAtteints(mesures(mesurerAssiduite(a, '2026-09-24')))).not.toContain('dix-jours');
  });

  it('ne compte pas la semaine passée un lundi matin', () => {
    const a = assiduite({
      dernierJour: '2026-09-18',
      serie: 5,
      record: 5,
      semaine: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'],
    });
    // Vendredi puis lundi : la série tient, mais la semaine repart de zéro.
    expect(mesurerAssiduite(a, '2026-09-21')).toEqual({ serieJours: 5, joursActifsCetteSemaine: 0 });
  });

  it('compte le jour joué au moment du crédit', () => {
    const avant = assiduite({ dernierJour: '2026-09-18', serie: 9, record: 9, semaine: ['2026-09-18'] });
    const apres = apresUneSerie(avant, '2026-09-21');
    expect(mesurerAssiduite(apres, '2026-09-21')).toEqual({ serieJours: 10, joursActifsCetteSemaine: 1 });
    expect(paliersAtteints(mesures(mesurerAssiduite(apres, '2026-09-21')))).toContain('dix-jours');
  });
});
