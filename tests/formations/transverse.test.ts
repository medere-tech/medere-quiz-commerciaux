import { describe, expect, it } from 'vitest';

import {
  formationPrincipale,
  ID_FORMATION_TRANSVERSE,
  NOM_FORMATION_TRANSVERSE,
} from '@/lib/formations/transverse';
import type { Formation } from '@/lib/formations/lecture';
import type { Question } from '@/lib/questions/depot';
import type { QuestionListee } from '@/lib/questions/lecture';
import { lignesTrebuchees } from '@/lib/session/bilan';
import { classer } from '@/lib/statistiques/analyse';
import { mesurerCatalogue } from '@/lib/serie/recompenses';
import { consignesPourIa, ordonnerCatalogue } from '@/lib/import/modele';
import { analyserLigne, indexerFormations, ligneVierge } from '@/lib/import/lignes';

/**
 * La formation transverse « DPC et réglementation ».
 *
 * Ce que ces tests protègent :
 *
 * - **La règle de la formation principale.** Un écran qui n'en montre qu'une
 *   prend la première formation vendue, et la transverse seulement quand elle
 *   est seule — quel que soit l'ordre dans `formationIds`. Un ordre à
 *   maintenir à l'enregistrement se serait cassé à la première modification.
 * - **Le partage des récompenses.** Le DPC compte pour la couverture, pas
 *   pour la maîtrise d'une formation.
 * - **Le modèle d'import**, qui la cite en tête et sait l'importer.
 */

function formation(id: string, nom: string, cibles: string[] = []): Formation {
  return {
    id,
    nom,
    numeroActionDpc: id === ID_FORMATION_TRANSVERSE ? '' : `9262${id.slice(-3)}`,
    cibles,
    format: '',
    modalite: '',
    dureeTotale: '',
    urlWebflow: '',
    blocsCertification: [],
    actif: true,
  };
}

const TRANSVERSE = formation(ID_FORMATION_TRANSVERSE, NOM_FORMATION_TRANSVERSE);
const PARO = formation('recPAR', 'Parodontie clinique', ['Chirurgien dentiste']);

describe('formationPrincipale', () => {
  it('prend la formation vendue, même quand la transverse est citée en premier', () => {
    expect(formationPrincipale([ID_FORMATION_TRANSVERSE, 'recPAR'])).toBe('recPAR');
    expect(formationPrincipale(['recPAR', ID_FORMATION_TRANSVERSE])).toBe('recPAR');
  });

  it('prend la transverse quand elle est seule', () => {
    expect(formationPrincipale([ID_FORMATION_TRANSVERSE])).toBe(ID_FORMATION_TRANSVERSE);
  });

  it('garde l’ordre entre deux formations vendues', () => {
    expect(formationPrincipale(['recB', ID_FORMATION_TRANSVERSE, 'recA'])).toBe('recB');
  });

  it('ne rend rien pour une question sans formation', () => {
    expect(formationPrincipale([])).toBeUndefined();
  });
});

describe('Les écrans qui ne montrent qu’une formation suivent la règle', () => {
  const mixte = {
    id: 'q1',
    type: 'qcm',
    enonce: 'Combien d’heures sur trois ans ?',
    formationIds: [ID_FORMATION_TRANSVERSE, 'recPAR'],
    theme: 'Public et conditions',
    difficulte: 1,
    statut: 'publiee',
  } as unknown as QuestionListee & Question;

  it('le bilan de séance range une question mixte sous la formation vendue', () => {
    const [ligne] = lignesTrebuchees(
      [{ questionId: 'q1', reponses: 10, echecs: 4 }],
      [mixte],
      [TRANSVERSE, PARO],
    );

    expect(ligne?.formation?.id).toBe('recPAR');
  });

  it('les statistiques aussi', () => {
    const { fiables } = classer(
      [mixte],
      [{ questionId: 'q1', tentatives: 50, echecs: 10, majLe: null }],
      [TRANSVERSE, PARO],
    );

    expect(fiables[0]?.formation?.id).toBe('recPAR');
  });
});

describe('Les récompenses', () => {
  const avancement = (f: Formation, pourcentage: number) => ({ formation: f, maitrise: { pourcentage } });

  it('le DPC seul ne débloque pas « une formation entièrement maîtrisée »', () => {
    const mesures = mesurerCatalogue([avancement(TRANSVERSE, 100), avancement(PARO, 40)], []);

    expect(mesures.formationsMaitrisees).toBe(0);
  });

  it('une formation vendue la débloque toujours', () => {
    const mesures = mesurerCatalogue([avancement(TRANSVERSE, 20), avancement(PARO, 100)], []);

    expect(mesures.formationsMaitrisees).toBe(1);
  });

  it('le DPC compte dans « toutes les formations au-dessus de 80 % »', () => {
    const faible = mesurerCatalogue([avancement(TRANSVERSE, 50), avancement(PARO, 90)], []);
    const solide = mesurerCatalogue([avancement(TRANSVERSE, 85), avancement(PARO, 90)], []);

    expect(faible.formationsTotal).toBe(2);
    expect(faible.formationsSolides).toBe(1);
    expect(solide.formationsSolides).toBe(2);
  });
});

describe('Le modèle d’import', () => {
  const catalogue = [PARO, TRANSVERSE];

  it('cite la transverse en tête du catalogue', () => {
    expect(ordonnerCatalogue(catalogue).map((f) => f.id)).toEqual([ID_FORMATION_TRANSVERSE, 'recPAR']);

    const markdown = consignesPourIa(catalogue, new Date('2026-09-30T08:00:00Z'));
    const lignes = markdown.split('\n').filter((ligne) => /^\| (transverse|9262)/.test(ligne));
    expect(lignes[0]).toBe(`| ${ID_FORMATION_TRANSVERSE} | ${NOM_FORMATION_TRANSVERSE} |`);
  });

  it('dit où ranger une question sur les règles générales du DPC', () => {
    const markdown = consignesPourIa(catalogue, new Date('2026-09-30T08:00:00Z'));

    expect(markdown).toContain(`rattachez-la à \`${ID_FORMATION_TRANSVERSE}\``);
    expect(markdown).not.toContain('Une question qui ne se rattache à aucune formation du catalogue ne s’écrit pas');
  });

  it('importe une question rattachée à la transverse par son identifiant ou son nom', () => {
    const index = indexerFormations(catalogue);

    for (const ecrit of [ID_FORMATION_TRANSVERSE, NOM_FORMATION_TRANSVERSE]) {
      const ligne = ligneVierge(2);
      Object.assign(ligne.valeurs, {
        format: 'vrai ou faux',
        enonce: 'L’obligation de DPC est triennale.',
        bonnesReponses: 'Vrai',
        explication: 'Elle porte sur des périodes de trois ans.',
        formations: ecrit,
        theme: 'Public et conditions',
        difficulte: 'facile',
      });

      expect(analyserLigne(ligne, index).question?.formationIds, ecrit).toEqual([ID_FORMATION_TRANSVERSE]);
    }
  });
});
