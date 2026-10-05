import { afterEach, describe, expect, it, vi } from 'vitest';

import { CHAMPS, CHAMPS_SUJET, TABLE_SUJETS } from '@/lib/airtable/contrat';

/**
 * Ce que la synchronisation demande à Airtable — l'adresse elle-même, pas le
 * code qui la construit.
 *
 * **Le défaut que ce test garde.** Sans liste `fields[]`, Airtable renvoie
 * toutes les colonnes : la synchronisation lisait Prix, Devis et Indemnisation
 * depuis le premier lot, alors que le contrat dit de ne pas les lire. Ils
 * étaient ignorés à la conversion — et transitaient quand même par le serveur.
 *
 * Seul `fetch` est simulé : il enregistre l'adresse demandée et répond une
 * page vide, de la forme que l'API rend.
 */

vi.mock(import('@/lib/env/serveur'), () => ({
  envServeur: {
    projetId: 'demo-medere-quiz',
    clientEmail: '',
    clePrivee: '',
    domaineAutorise: 'medere.fr' as const,
    adressesAdministrateurs: [],
    airtable: { jeton: 'jeton-de-test', baseId: 'appBaseDeTest0000', tableFormations: 'tblFormations0000' },
    secretCron: '',
  },
}));

const { lireFormations, lireSujets } = await import('@/lib/airtable/client');

function demandes(): URL[] {
  const adresses: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (adresse: URL) => {
      adresses.push(new URL(adresse));
      return new Response(JSON.stringify({ records: [] }), { status: 200 });
    }),
  );
  return adresses;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Airtable — seuls les champs du contrat sont demandés', () => {
  it('la table Formations : les champs du contrat, et eux seuls', async () => {
    const adresses = demandes();
    await lireFormations();

    expect(adresses).toHaveLength(1);
    expect(adresses[0]?.pathname).toBe('/v0/appBaseDeTest0000/tblFormations0000');
    expect(adresses[0]?.searchParams.getAll('fields[]').sort()).toEqual(
      Object.values(CHAMPS).sort(),
    );
    expect(adresses[0]?.searchParams.get('returnFieldsByFieldId')).toBe('true');
  });

  it('ni Prix, ni Indemnisation, ni Devis', async () => {
    const adresses = demandes();
    await lireFormations();

    const demandes_ = adresses[0]?.searchParams.getAll('fields[]') ?? [];
    // Identifiants relevés au schéma de la base (docs/airtable-formations.md).
    for (const interdit of ['fldJQgWNl3AL0ofSN', 'fldx61z8Mjr6ezyg8', 'fldrS4zLnBcVc7G8n']) {
      expect(demandes_).not.toContain(interdit);
    }
    // Ni le champ de recherche, dont la forme change selon l'outil qui le lit.
    expect(demandes_).not.toContain('fldWnTXMH3bsdUQbx');
  });

  it('la table Sujets : son nom, et rien d’autre', async () => {
    const adresses = demandes();
    await lireSujets();

    expect(adresses[0]?.pathname).toBe(`/v0/appBaseDeTest0000/${TABLE_SUJETS}`);
    expect(adresses[0]?.searchParams.getAll('fields[]')).toEqual(Object.values(CHAMPS_SUJET));
  });
});
