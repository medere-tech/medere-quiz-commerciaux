import type { Instrumentation } from 'next';

/**
 * Point d'entrée exécuté au démarrage du serveur Next.js.
 *
 * La validation des variables d'environnement est déclenchée ici pour que
 * l'application refuse de démarrer, avec un message explicite, plutôt que
 * d'échouer plus tard sur une erreur d'initialisation Firebase.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  await import('@/lib/env/publiques');
  await import('@/lib/env/serveur');
}

/**
 * Journalisation des erreurs serveur.
 *
 * **Pourquoi elle reste.** Les journaux d'exécution Vercel n'affichent que
 * `FUNCTION_INVOCATION_FAILED` et une durée : ni le message, ni la pile. Le
 * 500 de production a coûté deux déploiements à diagnostiquer faute de voir
 * l'erreur réelle. C'est le pendant, côté serveur, de la règle qu'un `catch`
 * ne doit pas effacer une panne : ici, rien n'est attrapé, tout est écrit.
 */
export const onRequestError: Instrumentation.onRequestError = (erreur, requete) => {
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  console.error('Erreur serveur sur %s : %s', requete.path, message);

  if (erreur instanceof Error && erreur.stack) {
    console.error('Pile :', erreur.stack.split('\n').slice(0, 6).join(' | '));
  }
};
