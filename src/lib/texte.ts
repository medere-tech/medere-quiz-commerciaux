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
