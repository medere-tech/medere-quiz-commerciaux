/**
 * La présentation d'un sujet : ce que l'écran et le dépôt en savent tous deux.
 *
 * **Un module pur**, sans SDK : l'écran valide une saisie avant de l'envoyer,
 * et n'a pas à embarquer Firestore pour connaître une expression régulière.
 */

export type Presentation = {
  url: string;
  presenteeLe: Date;
  presentePar: string;
};

/** Ce que les règles acceptent : un lien Google Slides ou Google Drive, en https. */
export const ADRESSE_PRESENTATION = /^https:\/\/(docs|drive)\.google\.com\/.+/;

/** Une saisie que l'écran sait expliquer : son message s'affiche tel quel. */
export class ErreurPresentation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurPresentation';
  }
}
