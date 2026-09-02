import { exigerVariables } from '@/lib/env/validation';

/**
 * Variables exposées au navigateur. Elles sont remplacées à la compilation,
 * ce qui impose de les référencer littéralement : `process.env[nom]` ne
 * fonctionnerait pas côté client.
 *
 * Aucun secret ici. La clé d'API Firebase et la clé de site reCAPTCHA sont
 * des identifiants publics, visibles dans le code de la page ; ce qui protège
 * les données, ce sont les règles de sécurité et l'attestation App Check.
 */
export const envPubliques = exigerVariables('publique (navigateur)', {
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  // App Check : sans elle, aucune requête ne porte d'attestation. Exigée au
  // même titre que les autres, l'application ne démarre pas sans.
  NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY:
    process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY,
});

export const envAppCheck = {
  cleReCaptcha: envPubliques.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY,
  /**
   * Jeton de débogage, pour le développement local et les machines de test :
   * il remplace l'attestation reCAPTCHA, que le navigateur ne peut pas
   * produire hors d'un domaine enregistré.
   *
   * Seule variable App Check facultative : laissée vide, le SDK en génère un
   * et l'affiche dans la console du navigateur, à enregistrer une fois dans
   * la console Firebase. La renseigner sert à figer ce jeton entre plusieurs
   * machines. Elle n'a aucun effet en production.
   */
  jetonDebogage: (process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN ?? '').trim(),
} as const;
