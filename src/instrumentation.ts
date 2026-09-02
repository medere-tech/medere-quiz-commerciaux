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
