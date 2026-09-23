/**
 * L'adresse de la séance : celle qu'on lit sur l'écran projeté, et celle que
 * le QR encode.
 *
 * **Elle n'est plus écrite à la main.** Elle l'a été, et elle était fausse :
 * `medere.fr/rejoindre`, le domaine des adresses électroniques, qui ne sert
 * nulle part à naviguer. Personne ne l'avait vérifiée, et c'est ce que dix
 * commerciaux recopiaient le jeudi. Les deux fonctions du bas la prennent
 * désormais du navigateur — l'écran est projeté depuis l'application, donc son
 * origine *est* l'adresse de production, par construction, et elle suit les
 * prévisualisations sans qu'on y pense.
 *
 * **Le domaine ne se dicte pas, et c'est assumé.** Un `…vercel.app` de
 * vingt-huit caractères ne se recopie pas à l'oreille. Deux chemins le
 * contournent : le QR pour qui voit l'écran, le lien collé dans la
 * visioconférence pour les autres. Un domaine propre viendra ; le jour où il
 * arrive, rien ne change ici, parce que rien ici ne le nomme pour naviguer.
 */

/** La route réelle. `/rejoindre` mène à l'écran d'accès, code en main. */
export const CHEMIN_REJOINDRE = '/rejoindre';

/**
 * Le domaine de production, et **uniquement un repli**.
 *
 * Les deux fonctions du bas prennent l'adresse du navigateur dès qu'il y en a
 * un ; cette constante ne sert qu'au rendu serveur, où ni la salle d'attente
 * ni le QR n'existent encore — ils n'apparaissent qu'une fois la séance lue
 * par l'écouteur. Elle vaut tout de même la bonne valeur : une constante
 * fausse finit toujours par être lue par quelqu'un.
 */
export const DOMAINE_PUBLIC = 'medere-quiz-commerciaux.vercel.app';

/** L'adresse complète, telle qu'elle se lit de loin. Repli du rendu serveur. */
export const URL_REJOINDRE = `${DOMAINE_PUBLIC}${CHEMIN_REJOINDRE}`;

/**
 * L'adresse telle qu'elle se lit sur l'écran projeté.
 *
 * **Elle vient du navigateur, pas d'une constante.** `URL_REJOINDRE` était
 * écrite à la main : le domaine des adresses électroniques, qui ne sert nulle
 * part à naviguer. Rien ne garantissait qu'il réponde, et la salle entière
 * recopiait une adresse que personne n'avait vérifiée.
 *
 * Cet écran est projeté depuis l'application elle-même : `location.host` est
 * l'adresse de production par construction, et elle suit les prévisualisations
 * sans qu'on y pense. Le protocole ne s'affiche pas — on ne dicte pas
 * « h, t, t, p, s, deux-points ».
 *
 * Le repli ne sert qu'au rendu serveur, où la salle d'attente n'existe pas
 * encore : elle n'apparaît qu'une fois la séance lue par l'écouteur.
 */
export function adresseRejoindre(): string {
  if (typeof window === 'undefined') return URL_REJOINDRE;
  return `${window.location.host}${CHEMIN_REJOINDRE}`;
}

/**
 * Le lien complet que porte le QR, code compris.
 *
 * Même origine que ci-dessus, et le code voyage avec : scanner doit ouvrir la
 * séance, pas un formulaire vide où il faudrait ressaisir ce qu'on vient de
 * scanner.
 */
export function lienRejoindre(code: string): string {
  const origine =
    typeof window === 'undefined' ? `https://${DOMAINE_PUBLIC}` : window.location.origin;
  return `${origine}${CHEMIN_REJOINDRE}?code=${encodeURIComponent(code)}`;
}
