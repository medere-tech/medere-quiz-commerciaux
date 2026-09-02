import 'server-only';

import { envServeur } from '@/lib/env/serveur';
import type { EnregistrementAirtable } from '@/lib/airtable/contrat';

/**
 * Accès à l'API Airtable. **Lecture seule, strictement.**
 *
 * La base est pilotée par des automatisations en production. Ce module
 * n'expose aucune fonction d'écriture et n'émet que des requêtes GET : la
 * méthode est écrite en dur, elle n'est pas un paramètre. Le jeton lui-même
 * est créé avec les seuls scopes `data.records:read` et `schema.bases:read`,
 * de sorte que la protection est structurelle avant d'être comportementale.
 *
 * Si un besoin semble exiger une écriture dans Airtable, il faut s'arrêter et
 * en parler à Déthié, pas ajouter une fonction ici.
 */

const RACINE = 'https://api.airtable.com/v0';

/** Maximum accepté par l'API. */
const TAILLE_PAGE = 100;

/** Garde-fou : au-delà, c'est une boucle de pagination, pas un catalogue. */
const PAGES_MAXIMUM = 50;

const DELAI_REQUETE_MS = 15_000;

/** Airtable limite à cinq requêtes par seconde et par base. */
const PAUSE_ENTRE_PAGES_MS = 250;
const TENTATIVES_MAXIMUM = 3;

export class ErreurAirtable extends Error {
  readonly statut: number | undefined;

  constructor(message: string, statut?: number) {
    super(message);
    this.name = 'ErreurAirtable';
    this.statut = statut;
  }
}

function pause(millisecondes: number): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, millisecondes));
}

type PageAirtable = {
  records?: unknown;
  offset?: unknown;
};

async function lirePage(offset: string | undefined): Promise<{
  enregistrements: EnregistrementAirtable[];
  suivant: string | undefined;
}> {
  const adresse = new URL(
    `${RACINE}/${envServeur.airtable.baseId}/${envServeur.airtable.tableFormations}`,
  );
  // Sans ce paramètre, la réponse est indexée par nom de champ, et un
  // renommage dans Airtable casse la synchronisation en silence.
  adresse.searchParams.set('returnFieldsByFieldId', 'true');
  adresse.searchParams.set('pageSize', String(TAILLE_PAGE));
  if (offset) adresse.searchParams.set('offset', offset);

  let derniereErreur: ErreurAirtable | undefined;

  for (let tentative = 1; tentative <= TENTATIVES_MAXIMUM; tentative += 1) {
    let reponse: Response;

    try {
      reponse = await fetch(adresse, {
        // Écrit en dur, et non paramétrable : ce client ne sait que lire.
        method: 'GET',
        headers: {
          Authorization: `Bearer ${envServeur.airtable.jeton}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(DELAI_REQUETE_MS),
        cache: 'no-store',
      });
    } catch (erreur) {
      derniereErreur = new ErreurAirtable(
        `Airtable n'a pas répondu dans les ${DELAI_REQUETE_MS / 1000} secondes ` +
          `(${(erreur as Error).message}).`,
      );
      if (tentative < TENTATIVES_MAXIMUM) {
        await pause(1000 * tentative);
        continue;
      }
      throw derniereErreur;
    }

    // 429 : quota de requêtes dépassé. Airtable impose alors une pause de
    // trente secondes ; on retente plus doucement plutôt que d'abandonner.
    if (reponse.status === 429 && tentative < TENTATIVES_MAXIMUM) {
      await pause(2000 * tentative);
      continue;
    }

    if (!reponse.ok) {
      const detail = (await reponse.text().catch(() => '')).slice(0, 300);
      throw new ErreurAirtable(
        messageSelonStatut(reponse.status, detail),
        reponse.status,
      );
    }

    const page = (await reponse.json()) as PageAirtable;

    if (!Array.isArray(page.records)) {
      throw new ErreurAirtable(
        `Réponse Airtable inattendue : aucun tableau « records ». ` +
          `Vérifiez que AIRTABLE_TABLE_FORMATIONS désigne bien la table Formations.`,
      );
    }

    return {
      enregistrements: page.records as EnregistrementAirtable[],
      suivant: typeof page.offset === 'string' ? page.offset : undefined,
    };
  }

  throw derniereErreur ?? new ErreurAirtable('Airtable est resté injoignable.');
}

function messageSelonStatut(statut: number, detail: string): string {
  const suffixe = detail.length > 0 ? ` Détail : ${detail}` : '';

  if (statut === 401) {
    return (
      `Airtable refuse le jeton (401). Vérifiez AIRTABLE_TOKEN : il a pu être ` +
      `révoqué ou régénéré.${suffixe}`
    );
  }
  if (statut === 403) {
    return (
      `Airtable refuse l'accès (403). Le jeton doit porter les scopes ` +
      `data.records:read et schema.bases:read, et être autorisé sur la base ` +
      `des formations.${suffixe}`
    );
  }
  if (statut === 404) {
    return (
      `Base ou table introuvable (404). Vérifiez AIRTABLE_BASE_ID et ` +
      `AIRTABLE_TABLE_FORMATIONS contre docs/airtable-formations.md.${suffixe}`
    );
  }
  if (statut === 429) {
    return `Quota de requêtes Airtable dépassé (429), même après plusieurs tentatives.${suffixe}`;
  }
  return `Airtable a répondu ${statut}.${suffixe}`;
}

/**
 * Lit la table des formations, page par page, et renvoie tous les
 * enregistrements. Ne convertit rien : la conversion et la validation sont
 * dans `conversion.ts`, qui se teste sans réseau.
 */
export async function lireFormations(): Promise<EnregistrementAirtable[]> {
  const enregistrements: EnregistrementAirtable[] = [];
  let offset: string | undefined;
  let pages = 0;

  do {
    if (pages >= PAGES_MAXIMUM) {
      throw new ErreurAirtable(
        `Plus de ${PAGES_MAXIMUM} pages lues sans fin de pagination. ` +
          `La synchronisation est interrompue : c'est une boucle, pas un catalogue.`,
      );
    }

    const page = await lirePage(offset);
    enregistrements.push(...page.enregistrements);
    offset = page.suivant;
    pages += 1;

    if (offset) await pause(PAUSE_ENTRE_PAGES_MS);
  } while (offset);

  return enregistrements;
}
