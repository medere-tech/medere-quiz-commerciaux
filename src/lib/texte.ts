/**
 * Comparaison de textes saisis à la main.
 *
 * Une recherche qui exige l'accent exact échoue là où elle devrait aider :
 * « menopause » tapé vite ne doit pas rester sans résultat quand la formation
 * s'appelle « Accompagnement de la femme à la ménopause ». Même chose pour la
 * casse, et pour l'apostrophe droite que produit un clavier là où le texte
 * porte une apostrophe typographique.
 */
export function sansAccentNiCasse(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .trim();
}

/**
 * Forme normalisée d'un énoncé, pour la détection de doublons.
 *
 * Deux énoncés qui ne diffèrent que par la casse, les accents ou la
 * ponctuation sont le même énoncé : « Le DPC est-il obligatoire ? » et « le
 * dpc est il obligatoire » désignent la même question, et l'importer deux
 * fois est une erreur.
 *
 * Cette forme est stockée sur chaque question (`enonceNormalise`) parce que
 * Firestore ne compare que des chaînes exactes : sans champ dérivé, la
 * détection exigerait de télécharger la banque entière pour comparer.
 */
export function normaliserEnonce(enonce: string): string {
  return enonce
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
