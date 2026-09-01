import 'server-only';

import { DOMAINE_DES_REGLES } from '@/lib/auth/domaine';
import { ErreurConfiguration, exigerVariables, listeDAdresses } from '@/lib/env/validation';
import { envPubliques } from '@/lib/env/publiques';

/**
 * Variables strictement serveur. Le module `server-only` fait échouer la
 * compilation si un composant client l'importe par accident.
 *
 * Les variables Airtable ne sont pas exigées ici : elles arrivent au lot 2.
 */
const brutes = exigerVariables('serveur', {
  FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID,
  FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  ALLOWED_EMAIL_DOMAIN: process.env.ALLOWED_EMAIL_DOMAIN,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
});

const domaineAutorise = brutes.ALLOWED_EMAIL_DOMAIN.trim().toLowerCase();

if (domaineAutorise !== DOMAINE_DES_REGLES) {
  throw new ErreurConfiguration(
    `Le domaine autorisé « ${domaineAutorise} » ne correspond pas à celui des ` +
      `règles de sécurité Firestore (« ${DOMAINE_DES_REGLES} »). ` +
      `Les règles ne lisent pas les variables d'environnement : mettez à jour ` +
      `firestore.rules et la constante DOMAINE_DES_REGLES, puis redéployez les règles.`,
  );
}

if (brutes.FIREBASE_ADMIN_PROJECT_ID !== envPubliques.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
  throw new ErreurConfiguration(
    `Le projet Firebase du SDK Admin (« ${brutes.FIREBASE_ADMIN_PROJECT_ID} ») ` +
      `diffère de celui du client (« ${envPubliques.NEXT_PUBLIC_FIREBASE_PROJECT_ID} »). ` +
      `Le serveur écrirait dans une autre base que celle que lit le navigateur. ` +
      `Alignez FIREBASE_ADMIN_PROJECT_ID et NEXT_PUBLIC_FIREBASE_PROJECT_ID.`,
  );
}

const adressesAdministrateurs = listeDAdresses(brutes.ADMIN_EMAILS);

if (adressesAdministrateurs.length === 0) {
  throw new ErreurConfiguration(
    `ADMIN_EMAILS ne contient aucune adresse exploitable. ` +
      `Sans elle, personne ne reçoit le rôle administrateur et le back-office ` +
      `reste inaccessible. Attendu : des adresses séparées par des virgules.`,
  );
}

const horsDomaine = adressesAdministrateurs.filter(
  (adresse) => !adresse.endsWith(`@${domaineAutorise}`),
);

if (horsDomaine.length > 0) {
  throw new ErreurConfiguration(
    `ADMIN_EMAILS contient des adresses hors du domaine autorisé : ` +
      `${horsDomaine.join(', ')}. Elles ne pourront jamais se connecter.`,
  );
}

export const envServeur = {
  projetId: brutes.FIREBASE_ADMIN_PROJECT_ID,
  clientEmail: brutes.FIREBASE_ADMIN_CLIENT_EMAIL,
  // La clé privée traverse l'environnement avec des retours à la ligne échappés.
  clePrivee: brutes.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\n/g, '\n'),
  domaineAutorise,
  adressesAdministrateurs,
} as const;
