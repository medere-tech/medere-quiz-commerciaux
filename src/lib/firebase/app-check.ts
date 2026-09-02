import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import type { FirebaseApp } from 'firebase/app';

import { envAppCheck } from '@/lib/env/publiques';

/**
 * App Check atteste que la requête vient bien de notre application, et non
 * d'un script qui rejouerait la clé d'API Firebase depuis n'importe où. Il ne
 * remplace ni l'authentification ni les règles de sécurité : il filtre en
 * amont, sur l'origine de l'appel.
 *
 * La clé de site est exigée au démarrage : il n'existe pas de mode dégradé
 * où l'application tournerait sans attestation. L'application stricte, elle,
 * s'active dans la console Firebase, et seulement après avoir vérifié dans
 * les métriques que le trafic légitime remonte comme vérifié — sans quoi on
 * coupe l'accès à tout le monde d'un coup. Procédure au README, section 4.
 */

let demarre = false;

export function demarrerAppCheck(application: FirebaseApp): void {
  // Le navigateur seul peut produire une attestation.
  if (typeof window === 'undefined' || demarre) return;

  // En développement, le domaine local n'est pas enregistré auprès de
  // reCAPTCHA : le jeton de débogage prend la place de l'attestation. Il doit
  // être posé avant l'initialisation, et n'a aucun effet en production.
  if (process.env.NODE_ENV !== 'production') {
    (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN =
      envAppCheck.jetonDebogage === '' ? true : envAppCheck.jetonDebogage;
  }

  initializeAppCheck(application, {
    provider: new ReCaptchaEnterpriseProvider(envAppCheck.cleReCaptcha),
    // Le jeton dure une heure : sans renouvellement automatique, une session
    // du jeudi qui dépasse l'heure verrait ses requêtes perdre leur
    // attestation en cours de route.
    isTokenAutoRefreshEnabled: true,
  });

  demarre = true;
}
