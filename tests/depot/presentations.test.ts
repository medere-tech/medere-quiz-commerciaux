import type { IdTokenResult } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';

import { baseCourante, poserBase } from './aide';
import { connecte, creerEnvironnement, JORDAN, NOEMIE } from '../regles/aide';
import { fausseAuth } from '../aide/faux';

/**
 * La présentation d'un sujet, saisie par le vrai dépôt du back-office, sous
 * les vraies règles, sur l'émulateur.
 *
 * Ce qui se vérifie ici et nulle part ailleurs : **le nom que le dépôt signe
 * est celui que les règles exigent.** Le dépôt le lit dans le jeton
 * (`getIdTokenResult`), les règles le comparent à `request.auth.token.name`.
 * Les deux bouts d'une même garantie, éprouvés ensemble.
 *
 * Seuls la base et l'authentification sont injectées : la base est
 * l'émulateur, et le jeton du faux porte le nom que le jeton de l'émulateur
 * porte — sauf dans le test qui les fait diverger exprès.
 */

const nomDuJeton = vi.hoisted(() => ({ valeur: 'Noémie Vasseur' }));

function resultatDeJeton(nom: string): IdTokenResult {
  return {
    authTime: '',
    expirationTime: '',
    issuedAtTime: '',
    signInProvider: 'google.com',
    signInSecondFactor: null,
    token: '',
    claims: { name: nom },
  };
}

vi.mock(import('@/lib/firebase/firestore'), () => ({ baseDeDonnees: () => baseCourante() }));
vi.mock(import('@/lib/firebase/client'), () => ({
  authentification: () =>
    fausseAuth({
      uid: NOEMIE.uid,
      getIdTokenResult: async () => resultatDeJeton(nomDuJeton.valeur),
    }),
}));

const { enregistrerPresentation, retirerPresentation, chargerPresentations } = await import(
  '@/lib/sujets/depot'
);

const SUJET = 'recSujetSommeil01';
const URL_SLIDES = 'https://docs.google.com/presentation/d/abc/edit';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await creerEnvironnement();
});

afterEach(async () => {
  nomDuJeton.valeur = NOEMIE.nom;
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

describe('La présentation d’un sujet, saisie depuis le back-office', () => {
  it('Noémie l’enregistre, signée de son nom, puis la relit', async () => {
    poserBase(connecte(env, NOEMIE));
    const presenteeLe = new Date('2026-09-24T10:00:00Z');

    const enregistree = await enregistrerPresentation(SUJET, URL_SLIDES, presenteeLe);

    expect(enregistree).toEqual({ url: URL_SLIDES, presenteeLe, presentePar: 'Noémie Vasseur' });
    expect((await chargerPresentations([SUJET])).get(SUJET)).toEqual(enregistree);
  });

  it('Noémie la retire', async () => {
    poserBase(connecte(env, NOEMIE));
    await enregistrerPresentation(SUJET, URL_SLIDES, new Date('2026-09-24T10:00:00Z'));

    await retirerPresentation(SUJET);

    expect((await getDoc(doc(baseCourante(), 'presentations', SUJET))).exists()).toBe(false);
  });

  it('REFUS — un nom qui n’est pas celui du jeton présenté à la base', async () => {
    poserBase(connecte(env, NOEMIE));
    nomDuJeton.valeur = 'Quelqu’un d’autre';

    await expect(
      enregistrerPresentation(SUJET, URL_SLIDES, new Date('2026-09-24T10:00:00Z')),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('REFUS — un commercial n’écrit pas de présentation', async () => {
    poserBase(connecte(env, JORDAN));

    await expect(
      enregistrerPresentation(SUJET, URL_SLIDES, new Date('2026-09-24T10:00:00Z')),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('un compte sans nom ne signe pas à vide : le dépôt le dit avant la base', async () => {
    poserBase(connecte(env, NOEMIE));
    nomDuJeton.valeur = '';

    await expect(
      enregistrerPresentation(SUJET, URL_SLIDES, new Date('2026-09-24T10:00:00Z')),
    ).rejects.toThrow('Votre compte Google ne porte pas de nom');
  });
});
