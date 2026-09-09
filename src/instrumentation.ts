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

  /*
   * SONDE TEMPORAIRE — à retirer une fois le 500 de production expliqué.
   *
   * Posée ici parce que la sonde placée dans la disposition racine n'a jamais
   * imprimé : l'échec se produit au chargement du module, avant que le corps
   * du composant s'exécute. `register` est appelée une seule fois au démarrage
   * et doit se terminer avant que le serveur accepte la moindre requête —
   * c'est le seul point d'entrée garanti d'être atteint avant tout chargement
   * de `firebase-admin`.
   *
   * Elle vient après la validation d'environnement, qui garde la priorité :
   * un diagnostic ne doit pas passer devant un refus de démarrer légitime.
   */
  try {
    const { sonder } = await import('@/sonde-demarrage');
    await sonder();
  } catch (probleme) {
    // Une `register` qui lève empêche le serveur de démarrer : on remplacerait
    // un diagnostic par une panne.
    console.log('[SONDE] la sonde elle-même a échoué :', probleme);
  }
}

/**
 * SONDE TEMPORAIRE — l'erreur réelle derrière le `FUNCTION_INVOCATION_FAILED`
 * des journaux Vercel, qui n'en montre que le code.
 */
export const onRequestError: Instrumentation.onRequestError = (erreur, requete) => {
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  console.error('[SONDE] erreur de requête %s : %s', requete.path, message);

  if (erreur instanceof Error && erreur.stack) {
    console.error('[SONDE] pile :', erreur.stack.split('\n').slice(0, 6).join(' | '));
  }
};
