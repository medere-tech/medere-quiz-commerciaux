import { NextResponse } from 'next/server';

import { ErreurAirtable } from '@/lib/airtable/client';
import { ErreurAcces, exigerAdmin } from '@/lib/auth/session-serveur';
import { envServeur } from '@/lib/env/serveur';
import { ErreurSynchronisation, synchroniserFormations } from '@/lib/airtable/synchronisation';

// Le SDK Admin et le jeton Airtable exigent l'exécution Node.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Synchronisation du référentiel des formations.
 *
 * Deux appelants, deux authentifications, aucune porte ouverte :
 *
 * - `POST` — le bouton du back-office. Exige une session administrateur,
 *   vérifiée côté serveur sur le custom claim.
 * - `GET` — la tâche planifiée Vercel, toutes les six heures. Exige l'en-tête
 *   `Authorization: Bearer <CRON_SECRET>`, que Vercel pose lui-même dès que la
 *   variable est définie.
 *
 * Sans l'une ou l'autre, la réponse est 401. Cette route écrit dans Firestore :
 * elle n'est jamais accessible anonymement.
 */

function comparaisonConstante(gauche: string, droite: string): boolean {
  if (gauche.length !== droite.length) return false;
  let difference = 0;
  for (let index = 0; index < gauche.length; index += 1) {
    difference |= gauche.charCodeAt(index) ^ droite.charCodeAt(index);
  }
  return difference === 0;
}

function appelPlanifieAutorise(requete: Request): boolean {
  const entete = requete.headers.get('authorization') ?? '';
  const prefixe = 'Bearer ';
  if (!entete.startsWith(prefixe)) return false;
  return comparaisonConstante(entete.slice(prefixe.length), envServeur.secretCron);
}

async function executer(forcer: boolean): Promise<NextResponse> {
  try {
    const rapport = await synchroniserFormations({ forcer });
    return NextResponse.json(rapport, { status: rapport.ignoree ? 200 : 200 });
  } catch (erreur) {
    if (erreur instanceof ErreurSynchronisation) {
      // 409 : la demande est légitime, l'état de départ ne permet pas de la
      // satisfaire sans casse. Rien n'a été modifié.
      return NextResponse.json({ erreur: erreur.message }, { status: 409 });
    }

    if (erreur instanceof ErreurAirtable) {
      // 502 : ce n'est pas notre requête qui est mauvaise, c'est le service
      // d'en face qui n'a pas répondu comme prévu.
      return NextResponse.json({ erreur: erreur.message }, { status: 502 });
    }

    console.error('Synchronisation Airtable interrompue', erreur);
    return NextResponse.json(
      {
        erreur:
          `La synchronisation s'est interrompue. Le référentiel n'a pas été ` +
          `modifié à mi-parcours : relancez-la, et si l'erreur persiste, ` +
          `consultez les journaux du serveur.`,
      },
      { status: 500 },
    );
  }
}

/** Tâche planifiée. */
export async function GET(requete: Request): Promise<NextResponse> {
  if (!appelPlanifieAutorise(requete)) {
    return NextResponse.json(
      { erreur: 'Appel non autorisé.' },
      { status: 401 },
    );
  }

  // La tâche planifiée passe outre l'intervalle minimal : c'est elle qui
  // fixe le rythme, toutes les six heures.
  return executer(true);
}

/** Bouton de synchronisation manuelle du back-office. */
export async function POST(requete: Request): Promise<NextResponse> {
  try {
    await exigerAdmin();
  } catch (erreur) {
    if (erreur instanceof ErreurAcces) {
      return NextResponse.json({ erreur: erreur.message }, { status: erreur.statut });
    }
    throw erreur;
  }

  const corps = (await requete.json().catch(() => ({}))) as { forcer?: unknown };
  return executer(corps.forcer === true);
}
