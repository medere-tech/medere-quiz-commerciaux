import { describe, expect, it, vi } from 'vitest';

/**
 * Les deux comptages de l'écran des formations.
 *
 * **Ce que ces tests gardent, c'est le silence.** Un compteur qu'on ne sait pas
 * calculer ne s'affiche pas — ni zéro, ni tiret. Un zéro posé par défaut sur
 * une carte de formation se lirait « cette formation n'a aucune question », ce
 * qui est une tout autre nouvelle que « le compte n'est pas arrivé ».
 *
 * Le faux ci-dessous imite ce que fait vraiment Firestore : `getCountFromServer`
 * rend un agrégat dont on lit `.data().count`, et il **peut échouer** pour une
 * formation sans faire tomber les autres. Voir `CLAUDE.md`, « un faux qui rend
 * ce qui arrange ne prouve rien ».
 */

const comptesParFormation = new Map<string, number | Error>();
const requetesVues: string[] = [];
let simultaneesMax = 0;
let simultanees = 0;

vi.mock(import('@/lib/firebase/firestore'), () => ({ baseDeDonnees: () => ({}) as never }));

/*
 * **Le seul faux de la suite qui ne soit pas typé sur le module qu'il
 * remplace, et c'est délibéré.** `firebase/firestore` exporte des centaines de
 * symboles ; en satisfaire le type reviendrait à réimplémenter le SDK. La
 * forme à promesse — `vi.mock(import('…'))` — est donc écartée ici, et
 * seulement ici.
 *
 * **Ce que ce fichier ne prouve donc pas**, et qu'il faut savoir : que les
 * requêtes construites soient acceptables par Firestore. Un `in` combiné à un
 * `array-contains` peut réclamer un index composite, et ce faux dira toujours
 * oui. C'est la recette navigateur qui l'a vérifié — soixante agrégations
 * passées contre la vraie base, sur l'écran réel.
 */
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: (_base: unknown, ...clauses: unknown[]) => clauses,
  where: (champ: string, _op: string, valeur: unknown) => ({ champ, valeur }),
  getDocs: async () => ({ docs: [...brouillonsSemes], size: brouillonsSemes.length }),
  getCountFromServer: async (clauses: { champ: string; valeur: unknown }[]) => {
    const cible = clauses.find((clause) => clause.champ === 'formationIds')?.valeur as string;
    requetesVues.push(cible);
    simultanees += 1;
    simultaneesMax = Math.max(simultaneesMax, simultanees);
    await new Promise((r) => setTimeout(r, 5));
    simultanees -= 1;

    const compte = comptesParFormation.get(cible);
    if (compte instanceof Error) throw compte;
    return { data: () => ({ count: compte ?? 0 }) };
  },
}));

let brouillonsSemes: { data: () => Record<string, unknown> }[] = [];

const { compterBrouillonsParFormation, compterServiesParFormation } = await import(
  '@/lib/questions/depot'
);

function reinitialiser() {
  comptesParFormation.clear();
  requetesVues.length = 0;
  simultaneesMax = 0;
  simultanees = 0;
  brouillonsSemes = [];
}

describe('Les questions servies, par formation', () => {
  it('rend un compte par formation demandée', async () => {
    reinitialiser();
    comptesParFormation.set('f-1', 24).set('f-2', 0);

    const comptes = await compterServiesParFormation(['f-1', 'f-2']);

    expect(comptes.get('f-1')).toBe(24);
    expect(comptes.get('f-2')).toBe(0);
  });

  /*
   * **Le cas qui donne son sens au silence.** Une formation dont le comptage
   * échoue n'entre pas dans la carte : la carte s'affichera sans chiffre,
   * plutôt qu'avec un zéro qui voudrait dire autre chose.
   */
  it('n’invente rien pour une formation dont le comptage échoue', async () => {
    reinitialiser();
    comptesParFormation.set('f-1', 24).set('f-2', new Error('refus'));

    const comptes = await compterServiesParFormation(['f-1', 'f-2']);

    expect(comptes.get('f-1')).toBe(24);
    expect(comptes.has('f-2')).toBe(false);
  });

  /*
   * Soixante requêtes lâchées d'un coup se mettent en file dans le navigateur
   * et retardent tout ce qui part après elles, y compris la liste elle-même.
   */
  it('borne le nombre de comptages simultanés', async () => {
    reinitialiser();
    const identifiants = Array.from({ length: 30 }, (_, i) => `f-${i}`);
    for (const identifiant of identifiants) comptesParFormation.set(identifiant, 1);

    await compterServiesParFormation(identifiants);

    expect(requetesVues).toHaveLength(30);
    expect(simultaneesMax).toBeLessThanOrEqual(24);
  });

  /*
   * **Le test qui garde la régression.** Sans signal, les soixante requêtes
   * survivaient au démontage et l'écran suivant attendait derrière :
   * 24 978 ms mesurées contre 1 824 ms. Un drapeau `vivant` n'aurait rien
   * changé — il empêche d'écrire, pas d'émettre.
   */
  it('arrête d’émettre dès que l’écran est quitté', async () => {
    reinitialiser();
    const identifiants = Array.from({ length: 60 }, (_, i) => `f-${i}`);
    for (const identifiant of identifiants) comptesParFormation.set(identifiant, 1);

    const controleur = new AbortController();
    const promesse = compterServiesParFormation(identifiants, controleur.signal);
    /* On quitte pendant la première vague. */
    await new Promise((r) => setTimeout(r, 2));
    controleur.abort();
    await promesse;

    /* Une vague en vol au plus : c'est la borne de parallélisme qui le
       garantit, et c'est pour cela qu'elle existe. */
    expect(requetesVues.length).toBeLessThanOrEqual(24);
  });

  it('ne demande plus rien quand le signal est déjà levé', async () => {
    reinitialiser();
    const controleur = new AbortController();
    controleur.abort();

    const comptes = await compterServiesParFormation(['f-1', 'f-2'], controleur.signal);

    expect(requetesVues).toHaveLength(0);
    expect(comptes.size).toBe(0);
  });

  it('ne demande rien quand la liste est vide', async () => {
    reinitialiser();
    const comptes = await compterServiesParFormation([]);
    expect(comptes.size).toBe(0);
    expect(requetesVues).toHaveLength(0);
  });
});

describe('Les brouillons', () => {
  it('se comptent par formation et au total, en une lecture', async () => {
    reinitialiser();
    brouillonsSemes = [
      { data: () => ({ formationIds: ['f-1'] }) },
      { data: () => ({ formationIds: ['f-1'] }) },
      { data: () => ({ formationIds: ['f-2'] }) },
    ];

    const { parFormation, total } = await compterBrouillonsParFormation();

    expect(total).toBe(3);
    expect(parFormation.get('f-1')).toBe(2);
    expect(parFormation.get('f-2')).toBe(1);
  });

  /* Une question peut citer plusieurs formations : elle compte pour chacune,
     et une seule fois dans le total. */
  it('compte une question à cheval pour chaque formation', async () => {
    reinitialiser();
    brouillonsSemes = [{ data: () => ({ formationIds: ['f-1', 'f-2'] }) }];

    const { parFormation, total } = await compterBrouillonsParFormation();

    expect(total).toBe(1);
    expect(parFormation.get('f-1')).toBe(1);
    expect(parFormation.get('f-2')).toBe(1);
  });

  /* Une question importée peut n'avoir aucune formation, ou un champ d'une
     autre forme : elle ne doit pas faire tomber le comptage. */
  it('ignore ce qui ne ressemble pas à une liste d’identifiants', async () => {
    reinitialiser();
    brouillonsSemes = [
      { data: () => ({}) },
      { data: () => ({ formationIds: 'f-1' }) },
      { data: () => ({ formationIds: [42, 'f-2'] }) },
    ];

    const { parFormation, total } = await compterBrouillonsParFormation();

    expect(total).toBe(3);
    expect(parFormation.get('f-2')).toBe(1);
    expect(parFormation.size).toBe(1);
  });
});
