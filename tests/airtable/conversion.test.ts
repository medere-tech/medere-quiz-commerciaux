import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  CHAMPS,
  CHAMPS_SUJET,
  PLAFONDS,
  type EnregistrementAirtable,
} from '@/lib/airtable/contrat';
import {
  convertirEnregistrements,
  convertirSujets,
  desactiveraitToutLeCatalogue,
  formationsADesactiver,
  formationsDuMiroir,
  normaliserUrl,
  rattacherAuxSujets,
  sujetsADesactiver,
} from '@/lib/airtable/conversion';
import { ID_FORMATION_TRANSVERSE } from '@/lib/formations/transverse';

import { connecte, creerEnvironnement, NOEMIE } from '../regles/aide';

const SYNC_LE = new Date('2026-09-02T06:00:00Z');
const SUJET = 'recSujetParodont1';

function enregistrement(
  champs: Record<string, unknown> = {},
  id = 'rec1234567890abcd',
): EnregistrementAirtable {
  return {
    id,
    fields: {
      [CHAMPS.numeroActionDpc]: '12345678901',
      [CHAMPS.nom]: 'Parodontie clinique',
      [CHAMPS.cibles]: ['Chirurgien dentiste'],
      [CHAMPS.format]: 'E-Learning',
      [CHAMPS.modalite]: 'Formation continue',
      [CHAMPS.statutSource]: 'Active',
      [CHAMPS.blocsCertification]: ['2'],
      [CHAMPS.dureeTotale]: '7 heures',
      [CHAMPS.urlWebflow]: 'https://www.medere.fr/formations/parodontie',
      // La forme que l'API REST rend réellement : un tableau à plat d'identifiants.
      [CHAMPS.sujet]: [SUJET],
      ...champs,
    },
  };
}

function sansChamp(champ: string): EnregistrementAirtable {
  const base = enregistrement();
  delete base.fields[champ];
  return base;
}

describe('Conversion des enregistrements Airtable', () => {
  it('convertit un enregistrement complet', () => {
    const { formations, rejets } = convertirEnregistrements([enregistrement()], SYNC_LE);

    expect(rejets).toEqual([]);
    expect(formations).toHaveLength(1);
    expect(formations[0]).toEqual({
      airtableId: 'rec1234567890abcd',
      numeroActionDpc: '12345678901',
      nom: 'Parodontie clinique',
      cibles: ['Chirurgien dentiste'],
      format: 'E-Learning',
      modalite: 'Formation continue',
      blocsCertification: ['2'],
      dureeTotale: '7 heures',
      urlWebflow: 'https://www.medere.fr/formations/parodontie',
      sujetId: SUJET,
      actif: true,
      syncLe: SYNC_LE,
    });
  });

  it('lit par identifiant de champ, jamais par nom', () => {
    // Un enregistrement indexé par noms de champs — ce que renvoie l'API sans
    // returnFieldsByFieldId — ne doit rien produire d'exploitable.
    const parNoms: EnregistrementAirtable = {
      id: 'recNomsDeChamps00',
      fields: {
        "Numéro d'action DPC": '12345678901',
        'Nom de la formation': 'Parodontie clinique',
        'Public concerné': ['Chirurgien dentiste'],
      },
    };

    const { formations, rejets } = convertirEnregistrements([parNoms], SYNC_LE);

    expect(formations).toEqual([]);
    expect(rejets[0]?.raisons).toContain("le numéro d'action DPC est vide");
  });

  it('les champs facultatifs absents deviennent des valeurs vides', () => {
    const depouille: EnregistrementAirtable = {
      id: 'recMinimal0000000',
      fields: {
        [CHAMPS.numeroActionDpc]: '999',
        [CHAMPS.nom]: 'Formation minimale',
      },
    };

    const { formations, rejets } = convertirEnregistrements([depouille], SYNC_LE);

    expect(rejets).toEqual([]);
    expect(formations[0]).toMatchObject({
      cibles: [],
      blocsCertification: [],
      format: '',
      modalite: '',
      dureeTotale: '',
      urlWebflow: '',
      sujetId: null,
      // Aucun statut renseigné : la formation est écrite, mais hors catalogue.
      actif: false,
    });
  });

  it('coupe les espaces et dédoublonne les sélections multiples', () => {
    const { formations } = convertirEnregistrements(
      [
        enregistrement({
          [CHAMPS.nom]: '  Parodontie clinique  ',
          [CHAMPS.cibles]: ['Pédiatre', 'Pédiatre', '  Radiologue  ', ''],
        }),
      ],
      SYNC_LE,
    );

    expect(formations[0]?.nom).toBe('Parodontie clinique');
    expect(formations[0]?.cibles).toEqual(['Pédiatre', 'Radiologue']);
  });
});

describe('Statut et activation', () => {
  it('« Active » met la formation au catalogue', () => {
    const { formations } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.statutSource]: 'Active' })],
      SYNC_LE,
    );
    expect(formations[0]?.actif).toBe(true);
  });

  it('la casse de « Active » est sans importance', () => {
    for (const statut of ['active', 'ACTIVE', '  Active  ']) {
      const { formations } = convertirEnregistrements(
        [enregistrement({ [CHAMPS.statutSource]: statut })],
        SYNC_LE,
      );
      expect(formations[0]?.actif, statut).toBe(true);
    }
  });

  it('« Suspendue » la retire du catalogue, sans la supprimer', () => {
    const { formations } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.statutSource]: 'Suspendue' })],
      SYNC_LE,
    );
    expect(formations).toHaveLength(1);
    expect(formations[0]?.actif).toBe(false);
  });

  it('un statut absent retire la formation du catalogue', () => {
    const { formations, statutsInconnus } = convertirEnregistrements(
      [sansChamp(CHAMPS.statutSource)],
      SYNC_LE,
    );
    expect(formations[0]?.actif).toBe(false);
    expect(statutsInconnus).toEqual([]);
  });

  it('un statut réduit à des espaces retire la formation du catalogue', () => {
    const { formations } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.statutSource]: '   ' })],
      SYNC_LE,
    );
    expect(formations[0]?.actif).toBe(false);
  });

  it('un statut inconnu retire la formation du catalogue', () => {
    const { formations } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.statutSource]: 'En projet' })],
      SYNC_LE,
    );
    expect(formations[0]?.actif).toBe(false);
  });

  it("un statut qui ressemble à « Active » sans l'être ne suffit pas", () => {
    for (const statut of ['Activee', 'Active ?', 'Act', 'Inactive']) {
      const { formations } = convertirEnregistrements(
        [enregistrement({ [CHAMPS.statutSource]: statut })],
        SYNC_LE,
      );
      expect(formations[0]?.actif, statut).toBe(false);
    }
  });

  it('la formation reste écrite, quel que soit son statut', () => {
    const { formations, rejets } = convertirEnregistrements(
      [
        enregistrement({ [CHAMPS.statutSource]: 'Suspendue' }, 'recA00000000000001'),
        enregistrement({ [CHAMPS.statutSource]: '' }, 'recA00000000000002'),
        enregistrement({ [CHAMPS.statutSource]: 'En projet' }, 'recA00000000000003'),
      ],
      SYNC_LE,
    );
    // Jamais de suppression : une formation inactive reste en base, des
    // questions y sont rattachées.
    expect(rejets).toEqual([]);
    expect(formations).toHaveLength(3);
    expect(formations.every((formation) => formation.actif === false)).toBe(true);
  });

  it('un statut absent est signalé à part, avec son identifiant', () => {
    const { statutsAbsents, statutsInconnus } = convertirEnregistrements(
      [sansChamp(CHAMPS.statutSource)],
      SYNC_LE,
    );
    // Un oubli de saisie n'est pas une valeur qu'on ne sait pas lire :
    // les deux compteurs restent distincts.
    expect(statutsAbsents).toEqual(['rec1234567890abcd']);
    expect(statutsInconnus).toEqual([]);
  });

  it('un statut réduit à des espaces compte comme absent', () => {
    const { statutsAbsents } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.statutSource]: '   ' })],
      SYNC_LE,
    );
    expect(statutsAbsents).toEqual(['rec1234567890abcd']);
  });

  it('un statut renseigné ne remonte dans aucun des deux compteurs', () => {
    const { statutsAbsents, statutsInconnus } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.statutSource]: 'Active' })],
      SYNC_LE,
    );
    expect(statutsAbsents).toEqual([]);
    expect(statutsInconnus).toEqual([]);
  });

  it('un statut inconnu ne compte pas comme absent', () => {
    const { statutsAbsents, statutsInconnus } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.statutSource]: 'En projet' })],
      SYNC_LE,
    );
    expect(statutsAbsents).toEqual([]);
    expect(statutsInconnus).toEqual(['En projet']);
  });

  it('une formation rejetée ne remonte pas dans les statuts absents', () => {
    const sansStatutNiNom = sansChamp(CHAMPS.statutSource);
    sansStatutNiNom.fields[CHAMPS.nom] = '';

    const { rejets, statutsAbsents } = convertirEnregistrements([sansStatutNiNom], SYNC_LE);

    expect(rejets).toHaveLength(1);
    expect(statutsAbsents).toEqual([]);
  });

  it('un statut inconnu remonte au compte rendu', () => {
    const { formations, statutsInconnus } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.statutSource]: 'En projet' })],
      SYNC_LE,
    );
    expect(formations[0]?.actif).toBe(false);
    expect(statutsInconnus).toEqual(['En projet']);
  });
});

describe('Rejets — un enregistrement invalide n’emporte pas les autres', () => {
  it('rejette un nom vide', () => {
    const { formations, rejets } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.nom]: '   ' })],
      SYNC_LE,
    );
    expect(formations).toEqual([]);
    expect(rejets[0]?.raisons).toContain('le nom de la formation est vide');
  });

  it("rejette un numéro d'action DPC absent", () => {
    const { rejets } = convertirEnregistrements([sansChamp(CHAMPS.numeroActionDpc)], SYNC_LE);
    expect(rejets[0]?.raisons).toContain("le numéro d'action DPC est vide");
  });

  it('rejette un nom trop long', () => {
    const { rejets } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.nom]: 'a'.repeat(PLAFONDS.nom + 1) })],
      SYNC_LE,
    );
    expect(rejets[0]?.raisons).toContain(
      `le nom de la formation dépasse ${PLAFONDS.nom} caractères`,
    );
  });

  it('rejette un public concerné fourni comme chaîne', () => {
    const { rejets } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.cibles]: 'Chirurgien dentiste' })],
      SYNC_LE,
    );
    expect(rejets[0]?.raisons).toContain('le public concerné n’est pas une liste de textes');
  });

  it('rejette une URL Webflow trop longue', () => {
    const { rejets } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.urlWebflow]: `https://x/${'a'.repeat(PLAFONDS.urlWebflow)}` })],
      SYNC_LE,
    );
    expect(rejets[0]?.raisons).toContain(
      `l'URL Webflow dépasse ${PLAFONDS.urlWebflow} caractères`,
    );
  });

  it('rejette un second enregistrement portant le même identifiant', () => {
    const { formations, rejets } = convertirEnregistrements(
      [enregistrement(), enregistrement({ [CHAMPS.nom]: 'Doublon' })],
      SYNC_LE,
    );
    expect(formations).toHaveLength(1);
    expect(rejets[0]?.raisons).toContain('enregistrement renvoyé deux fois par Airtable');
  });

  it('convertit les enregistrements valides malgré un invalide au milieu', () => {
    const { formations, rejets } = convertirEnregistrements(
      [
        enregistrement({}, 'recValide00000001'),
        enregistrement({ [CHAMPS.nom]: '' }, 'recInvalide000001'),
        enregistrement({}, 'recValide00000002'),
      ],
      SYNC_LE,
    );

    expect(formations.map((formation) => formation.airtableId)).toEqual([
      'recValide00000001',
      'recValide00000002',
    ]);
    expect(rejets).toHaveLength(1);
    expect(rejets[0]?.airtableId).toBe('recInvalide000001');
  });

  it('accumule toutes les raisons du rejet, pas seulement la première', () => {
    const { rejets } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.nom]: '', [CHAMPS.numeroActionDpc]: '' })],
      SYNC_LE,
    );
    expect(rejets[0]?.raisons).toHaveLength(2);
  });
});

describe('Normalisation de l’adresse Webflow', () => {
  it('préfixe une adresse sans protocole', () => {
    expect(normaliserUrl('www.medere.fr/formation/covid-long')).toBe(
      'https://www.medere.fr/formation/covid-long',
    );
  });

  it('laisse une adresse déjà en https', () => {
    expect(normaliserUrl('https://www.medere.fr/x')).toBe('https://www.medere.fr/x');
  });

  it('laisse une adresse en http, sans la réécrire', () => {
    expect(normaliserUrl('http://www.medere.fr/x')).toBe('http://www.medere.fr/x');
  });

  it('reconnaît le protocole quelle que soit la casse', () => {
    expect(normaliserUrl('HTTPS://www.medere.fr/x')).toBe('HTTPS://www.medere.fr/x');
  });

  it('laisse une adresse vide vide', () => {
    expect(normaliserUrl('')).toBe('');
  });

  it('une adresse réduite à des espaces reste vide', () => {
    expect(normaliserUrl('   ')).toBe('');
  });

  it('la formation stocke l’adresse normalisée', () => {
    const { formations } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.urlWebflow]: 'www.medere.fr/formation/parodontie' })],
      SYNC_LE,
    );
    expect(formations[0]?.urlWebflow).toBe('https://www.medere.fr/formation/parodontie');
  });

  it('une formation sans adresse garde une chaîne vide', () => {
    const { formations } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.urlWebflow]: '' })],
      SYNC_LE,
    );
    expect(formations[0]?.urlWebflow).toBe('');
  });

  it("REFUS — une adresse qui dépasse le plafond une fois le protocole ajouté", () => {
    // Exactement 500 caractères telle quelle, donc sous le plafond ; 508 une
    // fois « https:// » ajouté. C'est la valeur stockée qui est bornée.
    const limite = `www.medere.fr/${'a'.repeat(PLAFONDS.urlWebflow - 'www.medere.fr/'.length)}`;
    expect(limite.length).toBeLessThanOrEqual(PLAFONDS.urlWebflow);

    const { formations, rejets } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.urlWebflow]: limite })],
      SYNC_LE,
    );

    expect(formations).toEqual([]);
    expect(rejets[0]?.raisons).toContain(
      `l'URL Webflow dépasse ${PLAFONDS.urlWebflow} caractères`,
    );
  });

  it('une adresse qui tient dans le plafond après normalisation est acceptée', () => {
    const juste = `www.medere.fr/${'a'.repeat(PLAFONDS.urlWebflow - 8 - 'www.medere.fr/'.length)}`;
    const { formations, rejets } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.urlWebflow]: juste })],
      SYNC_LE,
    );

    expect(rejets).toEqual([]);
    expect(formations[0]?.urlWebflow.length).toBe(PLAFONDS.urlWebflow);
  });
});

describe('Garde-fou : une réponse vide ne vide pas le catalogue', () => {
  it('interrompt quand Airtable ne renvoie rien alors que la base est peuplée', () => {
    expect(desactiveraitToutLeCatalogue(0, 42)).toBe(true);
  });

  it('laisse passer une première synchronisation sur une base vide', () => {
    expect(desactiveraitToutLeCatalogue(0, 0)).toBe(false);
  });

  it('laisse passer une synchronisation normale', () => {
    expect(desactiveraitToutLeCatalogue(42, 42)).toBe(false);
  });

  it('laisse passer la disparition de quelques formations', () => {
    expect(desactiveraitToutLeCatalogue(40, 42)).toBe(false);
  });
});

describe('Accord entre la validation serveur et les règles Firestore', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await creerEnvironnement();
  });

  afterEach(async () => {
    await env.clearFirestore();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('une formation acceptée par la conversion est acceptée par les règles', async () => {
    const { formations } = convertirEnregistrements([enregistrement()], SYNC_LE);
    expect(formations).toHaveLength(1);

    await assertSucceeds(
      setDoc(
        doc(connecte(env, NOEMIE), `formations/${formations[0]?.airtableId}`),
        formations[0] as Record<string, unknown>,
      ),
    );
  });

  it('une formation aux valeurs vides acceptées par la conversion passe aussi les règles', async () => {
    const { formations } = convertirEnregistrements(
      [
        {
          id: 'recMinimal0000000',
          fields: { [CHAMPS.numeroActionDpc]: '999', [CHAMPS.nom]: 'Formation minimale' },
        },
      ],
      SYNC_LE,
    );

    await assertSucceeds(
      setDoc(
        doc(connecte(env, NOEMIE), 'formations/recMinimal0000000'),
        formations[0] as Record<string, unknown>,
      ),
    );
  });

  it('ce que la conversion rejette serait de toute façon refusé par les règles', async () => {
    const trop = { nom: 'a'.repeat(PLAFONDS.nom + 1) };
    const { formations, rejets } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.nom]: trop.nom })],
      SYNC_LE,
    );

    expect(formations).toEqual([]);
    expect(rejets).toHaveLength(1);

    // Le même document, écrit de force, est refusé par les règles : les deux
    // validations disent la même chose.
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), 'formations/recTropLong000000'), {
        airtableId: 'recTropLong000000',
        numeroActionDpc: '12345678901',
        nom: trop.nom,
        cibles: [],
        format: '',
        modalite: '',
        blocsCertification: [],
        dureeTotale: '',
        urlWebflow: '',
        sujetId: null,
        actif: true,
        syncLe: SYNC_LE,
      }),
    );
  });
});

/**
 * La formation transverse n'a jamais été dans Airtable. Sans exemption, la
 * synchronisation la désactiverait à chaque passage — chaque nuit, par la
 * tâche planifiée — et le garde-fou la compterait comme un catalogue peuplé.
 */
describe('Formation transverse : la synchronisation ne la touche pas', () => {
  const existantes = [
    { id: 'recAAA', actif: true },
    { id: 'recBBB', actif: true },
    { id: 'recCCC', actif: false },
    { id: ID_FORMATION_TRANSVERSE, actif: true, transverse: true },
  ];

  it('ne la désactive pas, alors qu’Airtable ne la renvoie jamais', () => {
    const aDesactiver = formationsADesactiver(existantes, new Set(['recAAA']));

    expect(aDesactiver.map((formation) => formation.id)).toEqual(['recBBB']);
  });

  it('la reconnaît à son drapeau autant qu’à son identifiant', () => {
    const aDesactiver = formationsADesactiver(
      [{ id: 'autre-transverse', actif: true, transverse: true }],
      new Set(),
    );

    expect(aDesactiver).toEqual([]);
  });

  it('ne la compte pas dans le miroir, pour que le garde-fou reste juste', () => {
    // Seule la transverse en base, Airtable vide : première synchronisation
    // d'une base neuve, pas un catalogue qu'on s'apprête à vider.
    const seule = formationsDuMiroir([{ id: ID_FORMATION_TRANSVERSE, actif: true, transverse: true }]);

    expect(desactiveraitToutLeCatalogue(0, seule.length)).toBe(false);
    expect(formationsDuMiroir(existantes)).toHaveLength(3);
  });

  it('continue de désactiver ce qui a disparu d’Airtable, et pas ce qui est déjà inactif', () => {
    const aDesactiver = formationsADesactiver(existantes, new Set());

    expect(aDesactiver.map((formation) => formation.id)).toEqual(['recAAA', 'recBBB']);
  });
});

describe('Le sujet d’une fiche', () => {
  it('lit le lien tel que l’API REST le rend : un tableau à plat d’identifiants', () => {
    const { formations } = convertirEnregistrements([enregistrement()], SYNC_LE);
    expect(formations[0]?.sujetId).toBe(SUJET);
  });

  it('une fiche sans sujet est écrite, avec `null`', () => {
    for (const valeur of [undefined, null, []]) {
      const { formations, rejets } = convertirEnregistrements(
        [enregistrement({ [CHAMPS.sujet]: valeur })],
        SYNC_LE,
      );
      expect(rejets).toEqual([]);
      expect(formations[0]?.sujetId).toBeNull();
    }
  });

  it('REFUS — deux sujets pour une fiche : rejetée et signalée, jamais tranchée', () => {
    const { formations, rejets } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.sujet]: [SUJET, 'recSujetAutre0001'] })],
      SYNC_LE,
    );
    expect(formations).toEqual([]);
    expect(rejets[0]?.raisons).toEqual(['la formation est rattachée à 2 sujets']);
  });

  it('REFUS — la forme du connecteur, qui n’est pas celle de l’API REST', () => {
    // Le relevé du 5 octobre 2026 a vu `{ linkedRecordIds, valuesByLinkedRecordId }`
    // par le connecteur. Si elle arrivait un jour par l'API, elle serait
    // signalée, pas lue de travers.
    const { formations, rejets } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.sujet]: { linkedRecordIds: [SUJET], valuesByLinkedRecordId: {} } })],
      SYNC_LE,
    );
    expect(formations).toEqual([]);
    expect(rejets[0]?.raisons).toContain(
      "le sujet n'est pas une liste d'identifiants d'enregistrement",
    );
  });

  it('REFUS — un lien qui n’a pas la forme d’un enregistrement', () => {
    const { rejets } = convertirEnregistrements(
      [enregistrement({ [CHAMPS.sujet]: ['COVID'] })],
      SYNC_LE,
    );
    expect(rejets[0]?.raisons).toEqual(['le sujet ne désigne pas un enregistrement Airtable']);
  });
});

describe('La table Sujets', () => {
  const sujet = (id: string, nom: unknown): EnregistrementAirtable => ({
    id,
    fields: { [CHAMPS_SUJET.nom]: nom },
  });

  it('convertit un sujet, actif tant qu’Airtable le renvoie', () => {
    const { sujets, rejets } = convertirSujets([sujet(SUJET, '  Parodontie  ')], SYNC_LE);
    expect(rejets).toEqual([]);
    expect(sujets).toEqual([{ airtableId: SUJET, nom: 'Parodontie', actif: true, syncLe: SYNC_LE }]);
  });

  it('REFUS — un nom vide ou trop long, sans emporter les autres', () => {
    const { sujets, rejets } = convertirSujets(
      [
        sujet('recSujetVide00001', ''),
        sujet('recSujetLong00001', 'a'.repeat(PLAFONDS.sujetNom + 1)),
        sujet(SUJET, 'Parodontie'),
      ],
      SYNC_LE,
    );
    expect(sujets.map((s) => s.airtableId)).toEqual([SUJET]);
    expect(rejets.map((r) => r.raisons[0])).toEqual([
      'le nom du sujet est vide',
      `le nom du sujet dépasse ${PLAFONDS.sujetNom} caractères`,
    ]);
  });

  it('REFUS — un sujet renvoyé deux fois', () => {
    const { sujets, rejets } = convertirSujets(
      [sujet(SUJET, 'Parodontie'), sujet(SUJET, 'Parodontie')],
      SYNC_LE,
    );
    expect(sujets).toHaveLength(1);
    expect(rejets[0]?.raisons).toEqual(['sujet renvoyé deux fois par Airtable']);
  });

  it('une fiche dont le sujet n’a pas été lu garde sa place, sans sujet, et se signale', () => {
    const { formations } = convertirEnregistrements(
      [
        enregistrement({}, 'recFicheConnue001'),
        enregistrement({ [CHAMPS.sujet]: ['recSujetPerdu0001'] }, 'recFichePerdue001'),
      ],
      SYNC_LE,
    );
    const { sujets } = convertirSujets([sujet(SUJET, 'Parodontie')], SYNC_LE);

    const resultat = rattacherAuxSujets(formations, sujets);

    expect(resultat.formations.map((f) => [f.airtableId, f.sujetId])).toEqual([
      ['recFicheConnue001', SUJET],
      ['recFichePerdue001', null],
    ]);
    expect(resultat.sujetsIntrouvables).toEqual(['recFichePerdue001']);
  });

  it('désactive un sujet disparu d’Airtable, jamais ce qui est déjà inactif', () => {
    const aDesactiver = sujetsADesactiver(
      [
        { id: SUJET, actif: true },
        { id: 'recSujetParti0001', actif: true },
        { id: 'recSujetDejaOff01', actif: false },
      ],
      new Set([SUJET]),
    );
    expect(aDesactiver.map((s) => s.id)).toEqual(['recSujetParti0001']);
  });
});
