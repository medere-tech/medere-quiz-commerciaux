import { NextResponse } from 'next/server';

import { lireSession } from '@/lib/auth/session-serveur';
import { preparerPanne } from '@/lib/journal/redaction';

// Le SDK Admin, appelé par `lireSession`, exige l'exécution Node.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Journal des pannes survenues dans le navigateur.
 *
 * **Pourquoi une route et pas un service tiers.** Vercel collecte déjà tout ce
 * que le serveur écrit sur la sortie d'erreur — c'est par là que passe
 * `onRequestError`. Écrire ici revient donc à verser les pannes du navigateur
 * dans le journal qui existe, au même endroit et au même format, sans
 * dépendance, sans compte à administrer, et sans un kilo-octet de plus sur les
 * écrans. Le raisonnement complet est dans `src/lib/journal/client.ts`.
 *
 * **Ce qui est écrit, et rien d'autre** : l'origine, le message, six lignes de
 * pile, le chemin de l'écran sans sa chaîne de requête, et le digest. Tout est
 * expurgé une seconde fois ici — adresses, chemins `users/{uid}`, jetons — car
 * un client ne se croit pas sur parole, fût-il le nôtre.
 *
 * **Aucun identifiant d'utilisateur n'est journalisé, le rôle suffit.** C'est
 * la même décision que dans `agregerReponseEntrainement`, prise pour la même
 * raison : savoir qu'une panne touche l'animatrice ou un commercial oriente la
 * recherche ; savoir lequel ne sert à rien et fabriquerait, pannes après
 * pannes, le journal nominatif que le reste du projet s'interdit.
 *
 * **La session est exigée.** Une route de journalisation ouverte sur un domaine
 * public est une invitation à remplir les journaux de quelqu'un d'autre. Le
 * trou qu'on ferme concerne des utilisateurs connectés, en séance : l'exiger ne
 * coûte rien et referme la porte. Une panne survenue avant la connexion reste
 * couverte côté serveur par `onRequestError`.
 */

/** Un signalement tient largement dedans ; au-delà, on ne lit même pas. */
const CORPS_MAX_OCTETS = 4_000;

export async function POST(requete: Request): Promise<NextResponse> {
  /*
   * **La réponse est toujours la même, quoi qu'il arrive.**
   *
   * Un `204` uniforme ne dit ni si la session est valable, ni si le corps a
   * été compris, ni si quelque chose a été écrit. Cette route n'a rien à
   * apprendre à qui l'interroge, et le navigateur n'a rien à en faire : il a
   * déjà une panne à l'écran.
   */
  const rien = new NextResponse(null, { status: 204 });

  const session = await lireSession();
  if (!session) return rien;

  const longueur = Number(requete.headers.get('content-length') ?? '0');
  if (longueur > CORPS_MAX_OCTETS) return rien;

  let corps: unknown;
  try {
    corps = await requete.json();
  } catch {
    return rien;
  }

  const panne = preparerPanne(corps as Record<string, unknown>);
  if (!panne) return rien;

  console.error(
    'Panne navigateur [%s] sur %s (%s) : %s',
    panne.origine,
    panne.chemin,
    session.admin ? 'équipe pédagogique' : 'commercial',
    panne.message,
  );

  if (panne.pile !== '') console.error('Pile navigateur :', panne.pile);
  // Le digest relie la panne vue à l'écran à celle déjà écrite côté serveur.
  if (panne.digest !== '') console.error('Référence :', panne.digest);

  return rien;
}
