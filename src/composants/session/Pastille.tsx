'use client';

import { Icone } from '@/composants/ds/Icone';
import { AVATARS, avatarOuDefaut, initiales } from '@/lib/session/avatar';

/**
 * L'avatar d'un commercial : un disque de couleur pleine et ses initiales.
 *
 * **Dessiné pour être reconnu de loin.** C'est la couleur qui porte, avant les
 * lettres : sur un écran projeté à plusieurs mètres, on distingue un disque
 * turquoise d'un disque orange bien avant de lire « YB ». Les initiales sont le
 * second niveau, pour la salle et pour les listes.
 *
 * Le rapport lettres / diamètre est fixe : les initiales occupent toujours un
 * peu moins de la moitié du disque, quelle que soit la taille demandée.
 */
export function Pastille({
  nom,
  avatar,
  taille = 34,
  titre,
}: {
  nom: string;
  avatar: unknown;
  /**
   * Diamètre. Un nombre de pixels, ou n'importe quelle longueur CSS — une
   * variable, typiquement.
   *
   * **Pourquoi accepter autre chose qu'un nombre.** La salle d'attente est
   * projetée et décline quatre densités : la pastille y mesure 58 pixels au
   * mur et 40 sur un téléphone. Ces tailles vivent dans la feuille de style,
   * en variables, et un composant qui n'accepte qu'un nombre obligerait à les
   * recopier en JavaScript — deux sources pour une même échelle. Le rapport
   * lettres / diamètre reste fixe dans les deux cas.
   */
  taille?: number | string;
  /** Infobulle, quand le nom n'est pas déjà écrit à côté. */
  titre?: string;
}) {
  const teinte = AVATARS[avatarOuDefaut(avatar)];
  const tailleTexte =
    typeof taille === 'number' ? Math.round(taille * 0.42) : `calc(${taille} * 0.42)`;

  return (
    <span
      title={titre}
      // Le nom accompagne la pastille partout où elle sert ; la répéter aux
      // technologies d'assistance dirait deux fois la même chose.
      aria-hidden="true"
      style={{
        width: taille,
        height: taille,
        flex: 'none',
        borderRadius: 999,
        background: teinte.fond,
        color: teinte.encre,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-sans)',
        fontSize: tailleTexte,
        fontWeight: 700,
        letterSpacing: '0.01em',
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {initiales(nom)}
    </span>
  );
}

/**
 * Les huit teintes, pour le choix au moment de rejoindre.
 *
 * **La teinte choisie porte une coche, pas ses initiales.** C'est le dessin de
 * la maquette, et il vaut mieux que le précédent : huit pastilles portant les
 * mêmes deux lettres ne se distinguaient que par leur fond, et l'anneau de
 * sélection se perdait sur les teintes sombres. La coche dit « celle-ci »
 * sans dépendre du contraste de l'anneau.
 *
 * **L'anneau fait tout le tour, en deux temps** : un liseré de la couleur du
 * fond, puis un cercle d'encre. Jamais une bordure d'un seul côté.
 *
 * Au bureau les huit tiennent sur une ligne ; sous 480 px elles passent en
 * grille de quatre, comme la maquette mobile les dispose.
 */
export function ChoixAvatar({
  nom,
  valeur,
  onChoisir,
}: {
  nom: string;
  valeur: unknown;
  onChoisir: (cle: keyof typeof AVATARS) => void;
}) {
  const choisi = avatarOuDefaut(valeur);

  return (
    <div className="choix-avatar" role="radiogroup" aria-label="Votre couleur">
      {(Object.keys(AVATARS) as (keyof typeof AVATARS)[]).map((cle) => {
        const actif = cle === choisi;
        const teinte = AVATARS[cle];

        return (
          <button
            key={cle}
            type="button"
            role="radio"
            aria-checked={actif}
            aria-label={teinte.libelle}
            onClick={() => onChoisir(cle)}
            style={{
              width: 44,
              height: 44,
              flex: 'none',
              padding: 0,
              borderRadius: 999,
              border: 'none',
              background: teinte.fond,
              color: teinte.encre,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.02em',
              lineHeight: 1,
              cursor: 'pointer',
              // Deux anneaux concentriques : un vide de la couleur de la carte,
              // puis le trait d'encre. La bordure fait tout le tour.
              boxShadow: actif
                ? '0 0 0 2px var(--surface-card), 0 0 0 4px var(--neutral-100)'
                : 'none',
              transition: 'box-shadow var(--duration-fast) var(--ease-standard)',
            }}
          >
            {actif ? (
              <Icone nom="check" taille={20} epaisseur={2.3} couleur={teinte.encre} />
            ) : (
              initiales(nom)
            )}
          </button>
        );
      })}
    </div>
  );
}
