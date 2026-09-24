import { type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { baseCourante, poserBase } from './aide';
import { connecte, creerEnvironnement, JORDAN, NOEMIE, session } from '../regles/aide';

/**
 * Laquelle des séances vivantes ? **La plus récemment lancée.**
 *
 * **Le défaut que ces tests ferment, et il attendait un jeudi.** Trois lectures
 * prenaient « la première trouvée » — chez Firestore, la première par
 * identifiant de document, c'est-à-dire au hasard du point de vue métier. Une
 * séance oubliée en pause la semaine d'avant reste vivante indéfiniment : le
 * jeudi suivant, `/animer` pouvait ouvrir celle-là, et l'accueil des
 * commerciaux annoncer une séance que personne n'anime.
 *
 * **Les identifiants de ces tests sont choisis à dessein.** La plus ancienne
 * porte `AAAA-…`, la plus récente `ZZZZ-…` : dans l'ordre de Firestore, la
 * mauvaise vient toujours en premier. Sans cette précaution, les tests
 * passeraient avec l'ancienne implémentation — c'est exactement ainsi que le
 * défaut a survécu jusqu'ici.
 */

vi.mock(import('@/lib/firebase/firestore'), () => ({ baseDeDonnees: () => baseCourante() }));

const { chercherSessionParCode, laPlusRecemmentLancee, maSessionEnCours, seanceOuverte } =
  await import('@/lib/session/depot');

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

const LA_SEMAINE_DERNIERE = new Date('2026-09-17T09:00:00Z');
const CE_MATIN = new Date('2026-09-24T09:00:00Z');

/**
 * Deux séances vivantes : une oubliée en pause la semaine dernière, une lancée
 * ce matin. L'ancienne vient en premier dans l'ordre des identifiants.
 */
async function semerDeuxVivantes(): Promise<void> {
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(
      doc(base, 'sessions/AAAA-oubliee-en-pause'),
      session({
        code: 'VIEILL',
        titre: 'Séance oubliée',
        statut: 'pause',
        ouverteLe: LA_SEMAINE_DERNIERE,
      }),
    );
    await setDoc(
      doc(base, 'sessions/ZZZZ-de-ce-matin'),
      session({
        code: 'JEUDI7',
        titre: 'Séance de ce matin',
        statut: 'encours',
        ouverteLe: CE_MATIN,
      }),
    );
  });
}

describe('laPlusRecemmentLancee', () => {
  it('rend la dernière lancée', () => {
    const vieille = { ouverteLeMs: 1, titre: 'vieille' };
    const neuve = { ouverteLeMs: 2, titre: 'neuve' };

    expect(laPlusRecemmentLancee([vieille, neuve])).toBe(neuve);
    expect(laPlusRecemmentLancee([neuve, vieille])).toBe(neuve);
  });

  it('rend `null` sur une liste vide', () => {
    expect(laPlusRecemmentLancee([])).toBeNull();
  });

  /*
   * Une séance vivante sans date de lancement n'arrive pas par l'application —
   * mais une écriture du SDK Admin contourne les règles, et une date absente
   * ne doit pas l'emporter sur une date connue.
   */
  it('traite une séance sans date de lancement comme la plus ancienne', () => {
    const sansDate = { ouverteLeMs: null, titre: 'sans date' };
    const datee = { ouverteLeMs: 1, titre: 'datée' };

    expect(laPlusRecemmentLancee([sansDate, datee])).toBe(datee);
  });

  /* Un tri en place réordonnerait la liste de l'appelant — ici les documents
     que le dépôt vient de lire. `[...seances]` l'évite, et ceci le garde. */
  it('ne modifie pas la liste qu’on lui donne', () => {
    const liste = [{ ouverteLeMs: 1 }, { ouverteLeMs: 2 }];
    laPlusRecemmentLancee(liste);

    expect(liste.map((s) => s.ouverteLeMs)).toEqual([1, 2]);
  });
});

describe('ce que l’animatrice ouvre', () => {
  it('anime la séance de ce matin, pas celle oubliée la semaine dernière', async () => {
    poserBase(connecte(env, NOEMIE));
    await semerDeuxVivantes();

    const trouvee = await maSessionEnCours(session().animateurUid as string);

    expect(trouvee?.titre).toBe('Séance de ce matin');
  });

  it('rend `null` quand aucune séance n’est vivante', async () => {
    poserBase(connecte(env, NOEMIE));
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(
        doc(contexte.firestore(), 'sessions/s-finie'),
        session({ statut: 'terminee' }),
      );
    });

    expect(await maSessionEnCours(session().animateurUid as string)).toBeNull();
  });
});

describe('ce que l’accueil annonce', () => {
  /* `seanceOuverte` ne retient que les séances en cours : celle en pause n'est
     pas annoncée. Mais entre deux en cours, c'est la dernière lancée. */
  it('annonce la dernière lancée', async () => {
    poserBase(connecte(env, JORDAN));
    await env.withSecurityRulesDisabled(async (contexte) => {
      const base = contexte.firestore();
      await setDoc(
        doc(base, 'sessions/AAAA-ancienne'),
        session({ code: 'VIEILL', titre: 'Ancienne', ouverteLe: LA_SEMAINE_DERNIERE }),
      );
      await setDoc(
        doc(base, 'sessions/ZZZZ-recente'),
        session({ code: 'JEUDI7', titre: 'Récente', ouverteLe: CE_MATIN }),
      );
    });

    expect((await seanceOuverte())?.titre).toBe('Récente');
  });
});

describe('ce qu’un code désigne', () => {
  it('trouve la séance vivante qui porte ce code', async () => {
    poserBase(connecte(env, JORDAN));
    await semerDeuxVivantes();

    expect((await chercherSessionParCode('JEUDI7'))?.titre).toBe('Séance de ce matin');
    expect((await chercherSessionParCode('VIEILL'))?.titre).toBe('Séance oubliée');
  });

  /* Une séance en pause se rejoint : c'est le moment où un retardataire
     rattrape la salle. */
  it('accepte une séance en pause', async () => {
    poserBase(connecte(env, JORDAN));
    await semerDeuxVivantes();

    expect(await chercherSessionParCode('VIEILL')).not.toBeNull();
  });

  it('ignore une séance terminée qui porterait le même code', async () => {
    poserBase(connecte(env, JORDAN));
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(
        doc(contexte.firestore(), 'sessions/s-finie'),
        session({ code: 'JEUDI7', statut: 'terminee' }),
      );
    });

    expect(await chercherSessionParCode('JEUDI7')).toBeNull();
  });
});
