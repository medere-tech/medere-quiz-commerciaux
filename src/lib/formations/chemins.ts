/**
 * Chemins Firestore partagés entre le serveur et le navigateur.
 *
 * Ce fichier n'importe rien, volontairement : il est lu par la
 * synchronisation (SDK Admin, serveur) comme par le back-office (SDK client).
 * Y placer un import ferait entrer l'un des deux SDK dans le paquet de
 * l'autre. La seule chose qui doit être commune, c'est la chaîne.
 */

/**
 * Compte rendu de la dernière synchronisation Airtable. Document unique.
 *
 * Les deux segments sont exposés séparément : le SDK Admin prend un chemin
 * complet, le SDK client prend des segments. Les recoller à chaque appel
 * finirait par produire deux vérités.
 */
export const SYNCHRONISATION_FORMATIONS = {
  collection: 'synchronisations',
  document: 'formations',
} as const;

export const DOCUMENT_ETAT_SYNCHRONISATION =
  `${SYNCHRONISATION_FORMATIONS.collection}/${SYNCHRONISATION_FORMATIONS.document}`;
