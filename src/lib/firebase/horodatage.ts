/**
 * Lecture d'un horodatage Firestore, sans dépendre du SDK.
 *
 * **Pourquoi ce module n'importe rien.** Il ne teste pas `instanceof Timestamp`
 * mais la présence de `toMillis` : importer le type obligerait chaque module
 * qui date quelque chose à tirer `firebase/firestore`, et c'est exactement le
 * poids qu'on surveille — voir `CLAUDE.md`. Le canard suffit ici : rien
 * d'autre, dans ces documents, ne porte cette méthode.
 *
 * Rend `null` quand le champ est absent ou d'une autre forme. Un horodatage
 * qu'on ne sait pas lire ne s'affiche pas — une date fausse ressemble
 * exactement à une date juste.
 */
export function enMillisecondes(valeur: unknown): number | null {
  if (valeur && typeof valeur === 'object' && 'toMillis' in valeur) {
    return (valeur as { toMillis: () => number }).toMillis();
  }
  return null;
}
