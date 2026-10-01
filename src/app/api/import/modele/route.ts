import { NextResponse } from 'next/server';

import { ErreurAcces, exigerAdmin } from '@/lib/auth/session-serveur';
import { firestoreAdmin } from '@/lib/firebase/admin';
import { enFormation } from '@/lib/formations/lecture';
import { classeurModele, consignesPourIa } from '@/lib/import/modele';

// Le SDK Admin exige l'exécution Node.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Le modèle d'import, en téléchargement.
 *
 * - `?forme=ia` : les consignes en Markdown, catalogue et exemples compris,
 *   à donner telles quelles à une IA.
 * - `?forme=tableur` : un classeur `.xlsx` à remplir dans Excel ou Google
 *   Sheets.
 *
 * **Administrateur seulement.** Le catalogue n'a rien de secret pour un
 * commercial, mais ce fichier n'a d'usage que dans l'écran d'import, et une
 * route qui lit Firestore avec le SDK Admin ne s'ouvre pas plus que
 * nécessaire.
 *
 * **Les formations actives seulement.** Une formation suspendue n'a pas à
 * être proposée à une IA : elle produirait des questions sur ce qu'on ne vend
 * plus. Elles sont lues dans Firestore, où la synchronisation les dépose —
 * jamais dans Airtable directement.
 *
 * **Jamais en cache.** Le fichier suit le catalogue du jour.
 */

const FORMES = {
  ia: {
    nom: 'consignes-questions-medere.md',
    type: 'text/markdown; charset=utf-8',
  },
  tableur: {
    nom: 'modele-questions-medere.xlsx',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
} as const;

type Forme = keyof typeof FORMES;

const estForme = (valeur: string | null): valeur is Forme => valeur === 'ia' || valeur === 'tableur';

export async function GET(requete: Request): Promise<NextResponse> {
  try {
    await exigerAdmin();
  } catch (erreur) {
    if (erreur instanceof ErreurAcces) {
      return NextResponse.json({ erreur: erreur.message }, { status: erreur.statut });
    }
    throw erreur;
  }

  const forme = new URL(requete.url).searchParams.get('forme');
  if (!estForme(forme)) {
    return NextResponse.json(
      { erreur: 'Précisez la forme du modèle : « ia » ou « tableur ».' },
      { status: 400 },
    );
  }

  const instantane = await firestoreAdmin()
    .collection('formations')
    .where('actif', '==', true)
    .get();

  const formations = instantane.docs
    .map((document) => enFormation(document.id, document.data()))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  const corps =
    forme === 'ia' ? consignesPourIa(formations, new Date()) : classeurModele(formations);

  return new NextResponse(corps as BodyInit, {
    headers: {
      'Content-Type': FORMES[forme].type,
      'Content-Disposition': `attachment; filename="${FORMES[forme].nom}"`,
      'Cache-Control': 'no-store',
    },
  });
}
