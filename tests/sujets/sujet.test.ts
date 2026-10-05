import { describe, expect, it } from 'vitest';

import { enFormation, type Formation } from '@/lib/formations/lecture';
import { identiteVisuelle } from '@/lib/formations/identite';
import {
  dureeLisible,
  fichesAffichees,
  fichesIndiscernables,
  formatDeFiche,
  identiteDuSujet,
  maitriseDuSujet,
  publicsDuSujet,
  questionsDuSujet,
} from '@/lib/sujets/sujet';
import type { EtatQuestion } from '@/lib/serie/tirage';

/**
 * Ce que ces tests protègent : les quatre faits du relevé du 5 octobre 2026
 * que la page d'un sujet doit savoir afficher (`docs/airtable-formations.md`,
 * « Ce que le relevé impose à la page par sujet »).
 *
 * Les fiches sont construites par `enFormation`, le convertisseur même que la
 * page emploie — pas par un objet recopié à la main.
 */

function fiche(id: string, champs: Record<string, unknown> = {}): Formation {
  return enFormation(id, {
    nom: `Fiche ${id}`,
    numeroActionDpc: `9262${id}`,
    cibles: ['Médecin généraliste'],
    format: 'E-Learning',
    modalite: 'Programme intégré',
    dureeTotale: '7',
    urlWebflow: 'https://www.medere.fr/x',
    sujetId: 'recSujetSommeil01',
    actif: true,
    ...champs,
  });
}

function etat(id: string, dejaVue: boolean, derniereRatee: boolean): EtatQuestion {
  return { id, dejaVue, derniereRatee, reussies: dejaVue && !derniereRatee ? 1 : 0 };
}

describe('Le format d’une fiche', () => {
  it('affiche le format de la base, pas celui du titre', () => {
    // Quatre fiches réelles : « Hybride » en base, « (E-learning) » dans le nom.
    const hybride = fiche('recHybride0000001', {
      format: 'Hybride',
      nom: 'Croissance et développement du petit enfant (E-learning)',
    });
    expect(formatDeFiche(hybride).libelle).toBe('Hybride');
  });

  it('reconnaît les formats de la base quelle que soit la casse', () => {
    expect(formatDeFiche(fiche('a', { format: 'E-Learning' })).libelle).toBe('E-learning');
    expect(formatDeFiche(fiche('b', { format: 'Classe virtuelle' })).icone).toBe('monitor');
    expect(formatDeFiche(fiche('c', { format: 'Présentiel' })).icone).toBe('users');
  });

  it('nomme un format vide au lieu de l’inventer', () => {
    expect(formatDeFiche(fiche('d', { format: '' })).libelle).toBe('Format non précisé');
  });
});

describe('Les fiches montrées', () => {
  it('range par format comme la maquette, puis par titre, sans les fiches retirées', () => {
    const fiches = [
      fiche('recE', { format: 'E-Learning', nom: 'B' }),
      fiche('recP', { format: 'Présentiel', nom: 'Z' }),
      fiche('recC', { format: 'Classe virtuelle', nom: 'A' }),
      fiche('recE2', { format: 'E-Learning', nom: 'A' }),
      fiche('recOff', { format: 'Présentiel', actif: false }),
    ];
    expect(fichesAffichees(fiches).map((f) => f.id)).toEqual(['recP', 'recC', 'recE2', 'recE']);
  });
});

describe('L’en-tête', () => {
  it('l’union des publics, sans doublon, dans l’ordre des fiches par identifiant', () => {
    const fiches = [
      fiche('recB', { cibles: ['Pédiatre', 'Médecin généraliste'] }),
      fiche('recA', { cibles: ['Médecin généraliste'] }),
    ];
    expect(publicsDuSujet(fiches)).toEqual(['Médecin généraliste', 'Pédiatre']);
  });

  it('la forme de la première fiche par identifiant, quel que soit l’ordre de lecture', () => {
    const pediatre = fiche('recA', { cibles: ['Pédiatre'] });
    const dentiste = fiche('recB', { cibles: ['Chirurgien dentiste'] });
    expect(identiteDuSujet([dentiste, pediatre])).toEqual(identiteVisuelle(pediatre));
    expect(identiteDuSujet([pediatre, dentiste])).toEqual(identiteVisuelle(pediatre));
  });
});

describe('Les fiches que seul le numéro d’action distingue', () => {
  it('repère deux fiches identiques sur le format, la modalité et le public', () => {
    // Troubles bipolaires : deux présentiels, programme intégré, psychiatre.
    const fiches = [
      fiche('recBip1', { format: 'Présentiel', cibles: ['Psychiatre'] }),
      fiche('recBip2', { format: 'Présentiel', cibles: ['Psychiatre'] }),
      fiche('recBip3', { format: 'E-Learning', cibles: ['Psychiatre'] }),
    ];
    expect([...fichesIndiscernables(fiches)].sort()).toEqual(['recBip1', 'recBip2']);
  });

  it('un public différent suffit à distinguer : le cas « Infertilité et cancers »', () => {
    const fiches = [
      fiche('recInf1', { cibles: ['Médecin généraliste'] }),
      fiche('recInf2', { cibles: ['Gynécologue'] }),
    ];
    expect(fichesIndiscernables(fiches).size).toBe(0);
  });

  it('le même public dans un autre ordre reste le même public', () => {
    const fiches = [
      fiche('recX', { cibles: ['Pédiatre', 'Médecin généraliste'] }),
      fiche('recY', { cibles: ['Médecin généraliste', 'Pédiatre'] }),
    ];
    expect(fichesIndiscernables(fiches).size).toBe(2);
  });
});

describe('La maîtrise d’un sujet', () => {
  const fiches = new Set(['recA', 'recB']);
  const questions = [
    { id: 'q1', formationIds: ['recA'] },
    // Rattachée aux deux fiches du sujet : comptée une fois.
    { id: 'q2', formationIds: ['recA', 'recB'] },
    { id: 'q3', formationIds: ['recB'] },
    { id: 'hors', formationIds: ['recAutre'] },
  ];
  const etats = [
    etat('q1', true, false),
    etat('q2', true, true),
    etat('q3', false, false),
    etat('hors', true, false),
  ];

  it('porte sur les questions du sujet, sans doublon', () => {
    expect(questionsDuSujet(questions, fiches).map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
  });

  it('compte maîtrisées, vues et à revoir avec les définitions de l’accueil', () => {
    expect(maitriseDuSujet(questions, etats, fiches)).toEqual({
      maitrisees: 1,
      total: 3,
      pourcentage: 33,
      vues: 2,
      aRevoir: 1,
    });
  });

  it('un sujet sans question vaut zéro sur zéro, pas une division', () => {
    expect(maitriseDuSujet([], [], fiches)).toMatchObject({ total: 0, pourcentage: 0 });
  });
});

describe('La durée', () => {
  it('ajoute l’unité à un nombre nu, comme l’écran Formations', () => {
    expect(dureeLisible('8')).toBe('8 h');
    expect(dureeLisible('7,5')).toBe('7,5 h');
  });

  it('laisse une durée déjà rédigée, et une durée vide', () => {
    expect(dureeLisible('7 heures')).toBe('7 heures');
    expect(dureeLisible('')).toBe('');
  });
});
