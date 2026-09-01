import { exigerVariables } from '@/lib/env/validation';

/**
 * Variables exposées au navigateur. Elles sont remplacées à la compilation,
 * ce qui impose de les référencer littéralement : `process.env[nom]` ne
 * fonctionnerait pas côté client.
 *
 * Aucun secret ici. La clé d'API Firebase est un identifiant public ; ce qui
 * protège les données, ce sont les règles de sécurité.
 */
export const envPubliques = exigerVariables('publique (navigateur)', {
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
