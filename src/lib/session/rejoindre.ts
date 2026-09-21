/**
 * L'adresse que l'animatrice dicte à la salle.
 *
 * **Elle est projetée sur un mur et recopiée à la main, sur un téléphone, par
 * quelqu'un qui l'entend pour la première fois.** Elle doit donc être courte,
 * sans tiret, sans ambiguïté à l'oral — « rejoindre » se dicte, `/session` se
 * confond avec « cession ».
 *
 * **Une seule source, et c'est le point de ce module.** Le chemin réel et le
 * texte affiché viennent d'ici tous les deux : un écran projeté qui dicterait
 * une adresse morte ferait rater la séance à toute la salle, et rien dans un
 * test ne l'aurait signalé. Le jour où la route bouge, elle bouge ici.
 */

/** La route réelle. `/rejoindre` mène à l'écran d'accès. */
export const CHEMIN_REJOINDRE = '/rejoindre';

/**
 * Le domaine, tel qu'il se dicte.
 *
 * Il ne sert qu'à l'affichage : l'application ne s'en sert jamais pour
 * naviguer, et il n'a donc pas à être exact au protocole près. Ce qui compte
 * est qu'il corresponde à ce qu'un commercial tapera dans sa barre d'adresse.
 */
export const DOMAINE_PUBLIC = 'medere.fr';

/** « medere.fr/rejoindre », l'adresse complète telle qu'elle se lit de loin. */
export const URL_REJOINDRE = `${DOMAINE_PUBLIC}${CHEMIN_REJOINDRE}`;
