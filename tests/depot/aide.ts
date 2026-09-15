import type { Firestore } from 'firebase/firestore';

/**
 * Le point d'injection des tests de dépôt.
 *
 * **Pourquoi ce module d'une ligne utile.** Les fonctions du dépôt appellent
 * `baseDeDonnees()` sans paramètre — c'est ce qui leur permet de rester des
 * appels nus dans les composants. Pour les faire parler à l'émulateur, on
 * remplace ce module de trois lignes par un `vi.mock`, et la fabrique du mock a
 * besoin d'une variable qu'elle ferme et que chaque test réassigne. Elle vit
 * ici pour que les fichiers de test la partagent sans se la passer.
 *
 * Aucune trace dans le code de production : le dépôt ignore ce module.
 */
let courante: Firestore | null = null;

export function poserBase(base: Firestore): void {
  courante = base;
}

export function baseCourante(): Firestore {
  if (courante === null) {
    throw new Error('Aucune base posée : appelez poserBase() avant d’exercer le dépôt.');
  }
  return courante;
}
