/**
 * Domaine de messagerie autorisé.
 *
 * Cette valeur est dupliquée dans `firestore.rules` : les règles de sécurité
 * n'ont pas accès aux variables d'environnement. La validation de démarrage
 * (src/lib/env/serveur.ts) refuse toute divergence entre ALLOWED_EMAIL_DOMAIN
 * et cette constante, pour qu'un changement de domaine ne laisse pas les
 * règles en arrière.
 */
export const DOMAINE_DES_REGLES = 'medere.fr';

/** L'adresse appartient-elle au domaine autorisé ? */
export function estDuDomaine(email: string | undefined, domaine: string): boolean {
  if (!email) return false;
  const normalisee = email.trim().toLowerCase();
  const arobase = normalisee.lastIndexOf('@');
  if (arobase <= 0) return false;
  return normalisee.slice(arobase + 1) === domaine.trim().toLowerCase();
}
