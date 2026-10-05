// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PanneSignalee } from '../../src/lib/journal/redaction';

/**
 * Ce que ces tests protègent : le plafond des signalements du navigateur, qui
 * n'avait jamais été vérifié que par lecture.
 *
 * Il valait cinq signalements par chargement de page, toutes origines
 * confondues. Sur la séance du jeudi — un seul écran, une heure, dix
 * personnes —, cinq pannes bénignes en début de séance rendaient muet tout ce
 * qui suivait. Il vaut désormais cinq par origine sur une fenêtre glissante de
 * soixante secondes, et il dit ce qu'il a écarté.
 *
 * **Ce qui est réel ici** : le module tel qu'il est livré, la fenêtre et la
 * page de happy-dom. **Ce qui est simulé** : l'horloge, pour parcourir une
 * minute sans l'attendre, et `sendBeacon`, qui ne fait qu'enregistrer ce qui
 * part — c'est ce qu'on observe, pas ce qu'on fait répondre.
 */

let envoyes: Promise<PanneSignalee>[] = [];

async function journal(): Promise<string[]> {
  return (await Promise.all(envoyes)).map((panne) => `${panne.origine} : ${panne.message}`);
}

/** Un module neuf à chaque test : son état vit au niveau du module. */
async function chargerModule() {
  vi.resetModules();
  return import('../../src/lib/journal/client');
}

beforeEach(() => {
  vi.useFakeTimers();
  envoyes = [];
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (_adresse: string, paquet: Blob) => {
      envoyes.push(paquet.text().then((texte) => JSON.parse(texte) as PanneSignalee));
      return true;
    },
  });
});

afterEach(() => {
  // Chaque module chargé laisse son écouteur `pagehide` sur la fenêtre, qui
  // est partagée par le fichier. On vide ici ce qu'il garde en attente, pour
  // qu'il n'écrive pas dans le journal du test suivant.
  window.dispatchEvent(new Event('pagehide'));
  vi.useRealTimers();
});

describe('le plafond de débit', () => {
  it('laisse passer cinq signalements d’une origine, pas le sixième', async () => {
    const { signalerPanne } = await chargerModule();

    for (let i = 1; i <= 6; i += 1) signalerPanne('ecriture', new Error(`refus ${i}`));

    expect(await journal()).toEqual([1, 2, 3, 4, 5].map((i) => `ecriture : refus ${i}`));
  });

  it('ne laisse pas une origine en rafale étouffer les autres', async () => {
    // Le défaut d'avant : cinq ressources manquantes en début de séance, et le
    // refus d'écriture de 10 h 40 ne partait plus.
    const { signalerPanne } = await chargerModule();

    for (let i = 1; i <= 8; i += 1) signalerPanne('ressource', new Error(`image ${i}`));
    signalerPanne('ecriture', new Error('crédit refusé'));

    expect(await journal()).toContain('ecriture : crédit refusé');
  });

  it('se rouvre une minute plus tard, au lieu de se taire jusqu’au rechargement', async () => {
    const { signalerPanne } = await chargerModule();

    for (let i = 1; i <= 5; i += 1) signalerPanne('ecriture', new Error(`refus ${i}`));
    vi.advanceTimersByTime(60_000);
    signalerPanne('ecriture', new Error('refus de 10 h 40'));

    expect(await journal()).toContain('ecriture : refus de 10 h 40');
  });

  it('glisse : une place se libère quand le plus ancien envoi sort de la minute', async () => {
    const { signalerPanne } = await chargerModule();

    signalerPanne('ecriture', new Error('refus 1'));
    vi.advanceTimersByTime(30_000);
    for (let i = 2; i <= 5; i += 1) signalerPanne('ecriture', new Error(`refus ${i}`));
    vi.advanceTimersByTime(30_000);
    // Le premier a soixante secondes : sa place est libre, pas les quatre autres.
    signalerPanne('ecriture', new Error('refus 6'));
    signalerPanne('ecriture', new Error('refus 7'));

    const lignes = await journal();
    expect(lignes).toContain('ecriture : refus 6');
    expect(lignes).not.toContain('ecriture : refus 7');
  });
});

describe('ce que le plafond a écarté', () => {
  it('le compte, et l’envoie seul quand la fenêtre se rouvre', async () => {
    // Sans nouvelle panne pour le déclencher : un compte qui attendrait la
    // suivante ne partirait jamais si la rafale était la dernière.
    const { signalerPanne } = await chargerModule();

    for (let i = 1; i <= 8; i += 1) signalerPanne('ecriture', new Error(`refus ${i}`));
    vi.advanceTimersByTime(60_000);

    expect((await journal()).at(-1)).toBe(
      'ecriture : 3 signalements écartés par le plafond (5 par minute et par origine)',
    );
  });

  it('dit « un signalement écarté » au singulier', async () => {
    const { signalerPanne } = await chargerModule();

    for (let i = 1; i <= 6; i += 1) signalerPanne('ecriture', new Error(`refus ${i}`));
    vi.advanceTimersByTime(60_000);

    expect((await journal()).at(-1)).toBe(
      'ecriture : 1 signalement écarté par le plafond (5 par minute et par origine)',
    );
  });

  it('l’envoie au départ de la page s’il n’a pas eu le temps', async () => {
    const { signalerPanne } = await chargerModule();

    for (let i = 1; i <= 7; i += 1) signalerPanne('ecriture', new Error(`refus ${i}`));
    window.dispatchEvent(new Event('pagehide'));

    expect((await journal()).at(-1)).toBe(
      'ecriture : 2 signalements écartés par le plafond (5 par minute et par origine)',
    );
  });

  it('ne compte pas deux fois ce qu’il a déjà rapporté', async () => {
    const { signalerPanne } = await chargerModule();

    for (let i = 1; i <= 6; i += 1) signalerPanne('ecriture', new Error(`refus ${i}`));
    vi.advanceTimersByTime(60_000);
    window.dispatchEvent(new Event('pagehide'));

    const comptes = (await journal()).filter((ligne) => ligne.includes('écarté'));
    expect(comptes).toHaveLength(1);
  });

  it('laisse repasser plus tard un signalement que le plafond a écarté', async () => {
    // Écarté n'est pas « déjà vu » : s'il revient, il doit pouvoir partir.
    const { signalerPanne } = await chargerModule();

    for (let i = 1; i <= 5; i += 1) signalerPanne('ecriture', new Error(`refus ${i}`));
    signalerPanne('ecriture', new Error('crédit refusé'));
    vi.advanceTimersByTime(60_000);
    signalerPanne('ecriture', new Error('crédit refusé'));

    expect(await journal()).toContain('ecriture : crédit refusé');
  });
});

describe('la déduplication', () => {
  it('écarte un doublon même après la minute : on perd la fréquence, pas l’événement', async () => {
    const { signalerPanne } = await chargerModule();

    signalerPanne('ecriture', new Error('refus'));
    vi.advanceTimersByTime(60_000);
    signalerPanne('ecriture', new Error('refus'));

    expect(await journal()).toEqual(['ecriture : refus']);
  });
});
