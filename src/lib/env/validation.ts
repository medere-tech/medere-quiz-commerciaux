/**
 * Validation des variables d'environnement.
 *
 * L'application doit échouer au démarrage, avec un message qui nomme ce qui
 * manque, plutôt que de planter plus tard sur une erreur d'initialisation
 * Firebase incompréhensible.
 */

export class ErreurConfiguration extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurConfiguration';
  }
}

/**
 * Vérifie que chaque variable fournie est présente et non vide.
 * Renvoie le même objet, typé sans `undefined`.
 */
export function exigerVariables<C extends string>(
  portee: string,
  variables: Record<C, string | undefined>,
): Record<C, string> {
  const manquantes = (Object.keys(variables) as C[])
    .filter((nom) => {
      const valeur = variables[nom];
      return valeur === undefined || valeur.trim() === '';
    })
    .sort();

  if (manquantes.length > 0) {
    throw new ErreurConfiguration(
      `Configuration ${portee} incomplète. ` +
        `${manquantes.length} variable(s) d'environnement absente(s) ou vide(s) : ` +
        `${manquantes.join(', ')}. ` +
        `Renseignez-les dans .env.local, en vous appuyant sur .env.example, ` +
        `puis relancez l'application.`,
    );
  }

  return variables as Record<C, string>;
}

/** Découpe une liste d'adresses séparées par des virgules. */
export function listeDAdresses(valeur: string): readonly string[] {
  return valeur
    .split(',')
    .map((adresse) => adresse.trim().toLowerCase())
    .filter((adresse) => adresse.length > 0);
}
