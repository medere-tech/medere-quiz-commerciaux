import 'server-only';

import { DOMAINE_DES_REGLES } from '@/lib/auth/domaine';
import { ErreurConfiguration, exigerVariables, listeDAdresses } from '@/lib/env/validation';
import { envPubliques } from '@/lib/env/publiques';

/**
 * Variables strictement serveur. Le module `server-only` fait échouer la
 * compilation si un composant client l'importe par accident.
 */
const brutes = exigerVariables('serveur', {
  FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID,
  FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  ALLOWED_EMAIL_DOMAIN: process.env.ALLOWED_EMAIL_DOMAIN,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  // Airtable, en lecture seule. Le jeton ne quitte jamais le serveur.
  AIRTABLE_TOKEN: process.env.AIRTABLE_TOKEN,
  AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID,
  AIRTABLE_TABLE_FORMATIONS: process.env.AIRTABLE_TABLE_FORMATIONS,
  // Secret partagé avec la tâche planifiée Vercel. Sans lui, la
  // synchronisation quotidienne n'a aucun moyen de s'authentifier, et une
  // route qui écrit dans la base ne peut pas rester ouverte sans
  // authentification.
  CRON_SECRET: process.env.CRON_SECRET,
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

// Les identifiants Airtable portent un préfixe stable. Le vérifier ici évite
// une erreur 404 incompréhensible au premier appel : une base confondue avec
// une table, ou un nom de table saisi à la place de son identifiant.
const identifiantBase = brutes.AIRTABLE_BASE_ID.trim();
const identifiantTable = brutes.AIRTABLE_TABLE_FORMATIONS.trim();

if (!identifiantBase.startsWith('app')) {
  throw new ErreurConfiguration(
    `AIRTABLE_BASE_ID (« ${identifiantBase} ») ne ressemble pas à un identifiant ` +
      `de base Airtable : ceux-ci commencent par « app ». ` +
      `Voir docs/airtable-formations.md.`,
  );
}

if (!identifiantTable.startsWith('tbl')) {
  throw new ErreurConfiguration(
    `AIRTABLE_TABLE_FORMATIONS (« ${identifiantTable} ») ne ressemble pas à un ` +
      `identifiant de table Airtable : ceux-ci commencent par « tbl ». ` +
      `Un nom de table ne convient pas — il se renomme, l'identifiant non. ` +
      `Voir docs/airtable-formations.md.`,
  );
}

if (brutes.CRON_SECRET.trim().length < 16) {
  throw new ErreurConfiguration(
    `CRON_SECRET fait moins de 16 caractères. Il authentifie à lui seul une ` +
      `route qui écrit dans Firestore. Générez-en un : ` +
      `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))".`,
  );
}

export const envServeur = {
  projetId: brutes.FIREBASE_ADMIN_PROJECT_ID,
  clientEmail: brutes.FIREBASE_ADMIN_CLIENT_EMAIL,
  // La clé privée traverse l'environnement avec des retours à la ligne
  // échappés. Selon l'hébergeur, ils arrivent déjà convertis (une valeur entre
  // guillemets dans .env.local) ou tels quels (une variable Vercel collée
  // depuis le fichier de compte de service). Le remplacement couvre les deux :
  // sans lui, le SDK Admin reçoit une clé illisible et échoue au premier appel.
  clePrivee: brutes.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  domaineAutorise,
  adressesAdministrateurs,
  airtable: {
    jeton: brutes.AIRTABLE_TOKEN,
    baseId: identifiantBase,
    tableFormations: identifiantTable,
  },
  secretCron: brutes.CRON_SECRET,
} as const;
