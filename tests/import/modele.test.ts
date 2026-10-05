import { describe, expect, it } from 'vitest';
import lireXlsx from 'read-excel-file/node';

import { lireCollage, lireFeuille, type ResultatCollage } from '@/lib/import/collage';
import { celluleEnTexte } from '@/lib/import/fichier';
import { analyserLigne, indexerFormations, type LigneAnalysee } from '@/lib/import/lignes';
import {
  classeurModele,
  consignesPourIa,
  exemplesDeQuestions,
  NOMS_FEUILLES,
  referenceFormation,
} from '@/lib/import/modele';
import { COLONNES_MODELE, ENTETE_MODELE, associerColonnes } from '@/lib/import/colonnes';
import { ANGLES } from '@/lib/questions/angles';
import type { Formation } from '@/lib/formations/lecture';

/**
 * Ce que ces tests protègent : la promesse du modèle, qui est d'être
 * importable tel quel.
 *
 * **Aucun faux ici.** Le Markdown est relu par `lireCollage`, le classeur par
 * `read-excel-file` puis `lireFeuille` — exactement le chemin d'un fichier
 * déposé sur l'écran d'import. Un exemple qui ne passerait pas l'analyse, un
 * en-tête que l'import ne reconnaîtrait pas, un classeur qu'il ne saurait pas
 * ouvrir : chacun fait tomber un test.
 */

function formation(valeurs: Partial<Formation> & Pick<Formation, 'id' | 'nom'>): Formation {
  return {
    numeroActionDpc: '',
    cibles: [],
    format: '',
    modalite: '',
    dureeTotale: '',
    urlWebflow: '',
    blocsCertification: [],
    actif: true,
    ...valeurs,
  };
}

/** Un catalogue qui ressemble au vrai : homonymes, champs manquants, valeurs piégées. */
const CATALOGUE: Formation[] = [
  formation({
    id: 'recPARO',
    nom: 'Parodontie clinique',
    numeroActionDpc: '92622525001',
    cibles: ['Chirurgien dentiste'],
    format: 'E-Learning',
    dureeTotale: '7 heures',
    blocsCertification: ['2'],
  }),
  formation({
    id: 'recMENO',
    nom: 'Ménopause : accompagner la patiente',
    numeroActionDpc: '92622525002',
    cibles: ['Médecin généraliste', 'Gynécologue'],
    format: 'Classe virtuelle',
    dureeTotale: '14 heures',
    blocsCertification: ['1'],
  }),
  // Homonymes : le nom seul désignerait l'une pour l'autre.
  formation({
    id: 'recURG1',
    nom: 'Urgences au cabinet',
    numeroActionDpc: '92622525003',
    cibles: ['Chirurgien dentiste'],
    format: 'Présentiel',
    dureeTotale: '4 heures',
  }),
  formation({
    id: 'recURG2',
    nom: 'Urgences au cabinet',
    numeroActionDpc: '92622525004',
    cibles: ['Pédiatre', 'Autres'],
    format: 'E-Learning',
    dureeTotale: '7 heures',
  }),
  // Sans numéro DPC : l'identifiant prend sa place.
  formation({ id: 'recSANS', nom: 'Formation sans numéro', cibles: ['Radiologue'] }),
  // Une virgule dans un public : inutilisable comme bonne réponse.
  formation({ id: 'recVIRG', nom: 'Pédopsychiatrie', cibles: ['Psychiatre, pédopsychiatre'] }),
  // La durée telle que le vrai référentiel la donne : un nombre nu, sans unité.
  // L'import lirait « 8 » comme la huitième proposition. Placées en tête de
  // leur sorte, ces formations seraient choisies les premières si le
  // générateur ne les écartait pas.
  formation({ id: 'recNUM1', nom: 'Endométriose', numeroActionDpc: '92622626016', dureeTotale: '8' }),
  formation({ id: 'recNUM2', nom: 'Diabète', numeroActionDpc: '92622626017', dureeTotale: '10' }),
  formation({ id: 'recNUM3', nom: 'Asthme', numeroActionDpc: '92622626018', dureeTotale: '11' }),
];

const INDEX = indexerFormations(CATALOGUE);

function analyser(resultat: ResultatCollage): LigneAnalysee[] {
  if (resultat.etat !== 'lu') throw new Error(`Lecture en échec : ${resultat.etat}`);
  return resultat.lignes.map((ligne) => analyserLigne(ligne, INDEX));
}

/** Une ligne propre : ni erreur, ni avertissement. Un exemple n'a pas droit à moins. */
function exigerPropres(analyses: LigneAnalysee[]) {
  for (const analyse of analyses) {
    expect(analyse.erreurs, `ligne ${analyse.ligne.numero}`).toEqual([]);
    expect(analyse.avertissements, `ligne ${analyse.ligne.numero}`).toEqual([]);
    expect(analyse.question).not.toBeNull();
  }
}

function blocCsv(markdown: string, rang: number): string {
  const blocs = [...markdown.matchAll(/```csv\n([\s\S]*?)\n```/g)].map((bloc) => bloc[1]!);
  const bloc = blocs[rang];
  if (bloc === undefined) throw new Error(`Bloc CSV ${rang} absent`);
  return bloc;
}

describe('exemplesDeQuestions', () => {
  it('couvre les trois formats, une ou deux fois chacun', () => {
    const formats = exemplesDeQuestions(CATALOGUE).map((ligne) => ligne.format);

    expect(formats.filter((format) => format === 'vrai ou faux')).toHaveLength(2);
    expect(formats.filter((format) => format === 'choix multiples')).toHaveLength(2);
    expect(formats.filter((format) => format === 'mise en situation')).toHaveLength(2);
  });

  it('ne rattache chaque exemple qu’à un numéro du catalogue, jamais à un nom', () => {
    const references = new Set(CATALOGUE.map(referenceFormation));

    for (const ligne of exemplesDeQuestions(CATALOGUE)) {
      expect(references.has(ligne.formations)).toBe(true);
    }
  });

  it('n’emploie que les cinq angles', () => {
    for (const ligne of exemplesDeQuestions(CATALOGUE)) {
      expect(ANGLES).toContain(ligne.theme);
    }
  });

  it('écarte un public qui contient une virgule plutôt que d’écrire un exemple faux', () => {
    const texte = JSON.stringify(exemplesDeQuestions(CATALOGUE));
    expect(texte).not.toContain('Psychiatre, pédopsychiatre');
  });

  it('désigne la réponse voulue, pas seulement une réponse qui passe', () => {
    // « Sans erreur » ne suffit pas : parmi « 3|1|2 », la bonne réponse « 1 »
    // passe, et désigne « 3 ». On relit donc les libellés retenus.
    for (const ligne of exemplesDeQuestions(CATALOGUE)) {
      const analyse = analyserLigne({ numero: 2, valeurs: ligne }, INDEX);
      const retenus = analyse.question!.bonnesReponses.map((id) => analyse.question!.options[id]);
      const ecrits = ligne.bonnesReponses.split('|');

      expect(retenus, ligne.enonce).toEqual(ecrits);
    }
  });

  it('garde l’exemple sur la durée quand le référentiel la donne en nombre nu', () => {
    // Le vrai catalogue : des durées « 8 », « 10 », « 11 », en heures. Sans
    // exemple sur la durée, l'IA ne saurait pas produire ce format-là.
    const reel = [
      formation({ id: 'recD8', nom: 'Endométriose', numeroActionDpc: '92622626016', dureeTotale: '8' }),
      formation({ id: 'recD10', nom: 'Diabète', numeroActionDpc: '92622626017', dureeTotale: '10' }),
      formation({ id: 'recD11', nom: 'Asthme', numeroActionDpc: '92622626018', dureeTotale: '11' }),
    ];
    const duree = exemplesDeQuestions(reel).find((ligne) => ligne.enonce === 'Quelle durée lui annoncez-vous ?');

    expect(duree?.reponses).toBe('8 h|10 h|11 h');
    expect(duree?.bonnesReponses).toBe('8 h');

    const analyse = analyserLigne({ numero: 2, valeurs: duree! }, indexerFormations(reel));
    expect(analyse.erreurs).toEqual([]);
    expect(analyse.question!.bonnesReponses.map((id) => analyse.question!.options[id])).toEqual(['8 h']);
  });

  it.each([
    ['1', '2'],
    ['Bloc 1', 'Bloc 2'],
  ])('nomme le bloc « Bloc 1 », que le référentiel écrive « %s » ou une autre forme', (premier, second) => {
    // Airtable est passé de « 1 » à « Bloc 1 » en octobre 2026. `libelleBloc`
    // n'ajoute « Bloc » qu'à un nombre nu : un préfixe inconditionnel
    // écrirait « Bloc Bloc 1 » sous les yeux des commerciaux (README, section 3).
    const blocs = [
      formation({ id: 'recB1', nom: 'Ménopause', numeroActionDpc: '92622525478', blocsCertification: [premier] }),
      formation({ id: 'recB2', nom: 'Diabète', numeroActionDpc: '92622525445', blocsCertification: [second] }),
    ];
    const bloc = exemplesDeQuestions(blocs).find((ligne) => ligne.theme === 'Certification');

    expect(bloc?.reponses).toBe('Bloc 1|Bloc 2');
    expect(bloc?.bonnesReponses).toBe('Bloc 1');
  });

  it('ne propose jamais un nombre nu, que l’import lirait comme un numéro', () => {
    for (const ligne of exemplesDeQuestions(CATALOGUE)) {
      for (const proposition of ligne.reponses.split('|').filter(Boolean)) {
        expect(proposition, ligne.enonce).not.toMatch(/^\d+$/);
      }
    }
  });

  it('n’écrit aucun argumentaire : le ton n’est pas celui de ce fichier', () => {
    // Le référentiel ne porte aucun texte de vente. Un argumentaire d'exemple
    // serait inventé, et une IA le recopierait comme modèle de ton.
    for (const ligne of exemplesDeQuestions(CATALOGUE)) expect(ligne.argumentaire).toBe('');
  });

  it('omet les exemples qu’un catalogue vide ne permet pas de construire', () => {
    expect(exemplesDeQuestions([])).toEqual([]);
  });
});

describe('consignes pour une IA', () => {
  const markdown = consignesPourIa(CATALOGUE, new Date('2026-09-29T10:00:00Z'));

  it('donne un en-tête que l’import reconnaît en entier', () => {
    const entetes = blocCsv(markdown, 0)
      .split(',')
      .map((cellule) => cellule.replace(/^"|"$/g, ''));
    const association = associerColonnes(entetes);

    expect(association.manquantes).toEqual([]);
    expect(association.ignorees).toEqual([]);
    expect(Object.keys(association.index)).toHaveLength(COLONNES_MODELE.length);
  });

  it('contient des exemples qui s’importent tels quels', () => {
    const analyses = analyser(lireCollage(blocCsv(markdown, 1)));

    expect(analyses).toHaveLength(exemplesDeQuestions(CATALOGUE).length);
    exigerPropres(analyses);
  });

  it('cite chaque formation active avec le numéro à recopier', () => {
    for (const actuelle of CATALOGUE) {
      expect(markdown).toContain(`| ${referenceFormation(actuelle)} | ${actuelle.nom} |`);
    }
  });

  it('nomme les cinq angles et les trois formats', () => {
    for (const angle of ANGLES) expect(markdown).toContain(`**${angle}**`);
    for (const format of ['vrai ou faux', 'choix multiples', 'mise en situation']) {
      expect(markdown).toContain(`**${format}**`);
    }
  });
});

describe('classeur pour un tableur', () => {
  it('s’ouvre avec le lecteur de l’écran d’import, feuilles dans l’ordre', async () => {
    const feuilles = await lireXlsx(Buffer.from(classeurModele(CATALOGUE)));

    expect(feuilles.map((feuille) => feuille.sheet)).toEqual(Object.values(NOMS_FEUILLES));
  });

  it('ne met que l’en-tête dans la première feuille, celle que l’import lit par défaut', async () => {
    const [questions] = await lireXlsx(Buffer.from(classeurModele(CATALOGUE)));
    const cellules = questions!.data.map((ligne) => ligne.map(celluleEnTexte));

    expect(cellules).toEqual([ENTETE_MODELE.split('\t')]);

    // L'en-tête seul se lit comme un tableau vide, pas comme un en-tête faux.
    const lu = lireFeuille(questions!.sheet, cellules);
    expect(lu.etat === 'lu' ? lu.lignes : 'illisible').toEqual([]);
  });

  it('range des exemples qui s’importent tels quels dans la feuille « Exemples »', async () => {
    const feuilles = await lireXlsx(Buffer.from(classeurModele(CATALOGUE)));
    const exemples = feuilles.find((feuille) => feuille.sheet === NOMS_FEUILLES.exemples)!;
    const analyses = analyser(
      lireFeuille(exemples.sheet, exemples.data.map((ligne) => ligne.map(celluleEnTexte))),
    );

    expect(analyses).toHaveLength(exemplesDeQuestions(CATALOGUE).length);
    exigerPropres(analyses);
  });

  it('garde le numéro DPC en texte', async () => {
    const feuilles = await lireXlsx(Buffer.from(classeurModele(CATALOGUE)));
    const catalogue = feuilles.find((feuille) => feuille.sheet === NOMS_FEUILLES.formations)!;

    expect(catalogue.data.slice(1).map((ligne) => ligne[0])).toEqual(
      CATALOGUE.map(referenceFormation),
    );
  });

  it('pose des listes déroulantes qui avertissent sans refuser', () => {
    // L'archive est stockée sans compression : le XML se lit dans les octets.
    const xml = new TextDecoder().decode(classeurModele(CATALOGUE));
    const listes = [...xml.matchAll(/<dataValidation [^>]*>[\s\S]*?<\/dataValidation>/g)].map(
      (liste) => liste[0],
    );

    // Trois colonnes, sur deux feuilles.
    expect(listes).toHaveLength(6);
    for (const liste of listes) expect(liste).toContain('errorStyle="warning"');
    expect(xml).toContain(`<formula1>&quot;${ANGLES.join(',')}&quot;</formula1>`);
  });

  it('reste lisible sans aucune formation', async () => {
    const feuilles = await lireXlsx(Buffer.from(classeurModele([])));
    expect(feuilles).toHaveLength(4);
  });
});

describe('listes déroulantes', () => {
  it('n’ont aucune valeur qui contienne une virgule', () => {
    // Une liste en ligne se sépare par des virgules : une valeur qui en porte
    // serait coupée en deux dans le tableur.
    for (const angle of ANGLES) expect(angle).not.toContain(',');
  });
});
