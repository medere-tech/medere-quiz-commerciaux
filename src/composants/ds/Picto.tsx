import type { CSSProperties } from 'react';

/**
 * Pictogramme dessiné de la marque.
 *
 * **Réservé aux grands emplacements.** Ces tracés sont dessinés en 56 × 56 avec
 * des traits fins et des contre-formes serrées : sous une trentaine de pixels
 * ils deviennent une tache grise. C'est la raison pour laquelle les avatars de
 * classement n'en sont pas — voir `src/lib/session/avatar.ts`. Ici la maquette
 * les pose à 28 et 30 px sur un fond clair, taille à laquelle ils tiennent.
 *
 * Distinct d'`Icone`, et à ne pas mélanger avec : `Icone` est le jeu unique de
 * l'interface, au trait, à l'échelle du texte. Un picto est une illustration.
 */
export type NomPicto =
  | 'calendrier'
  | 'professions'
  | 'question'
  | 'regularite'
  | 'distinction'
  | 'suivi'
  | 'soin'
  | 'dentaire';

export function Picto({
  nom,
  taille = 30,
  ton = 'encre',
  style,
}: {
  nom: NomPicto;
  taille?: number;
  /**
   * Sur fond encre, le picto passe en blanc.
   *
   * **Par masque, et non par un second fichier.** Le jeu livré comprend une
   * version blanche de chaque picto ; en embarquer une deuxième copie
   * doublerait le dossier et créerait deux fichiers à garder d'accord. Le
   * masque teinte le tracé existant dans la couleur du texte courant — un
   * fichier, deux fonds, et rien à resynchroniser le jour où le tracé change.
   */
  ton?: 'encre' | 'blanc';
  style?: CSSProperties;
}) {
  if (ton === 'blanc') {
    return (
      <span
        aria-hidden="true"
        style={{
          display: 'block',
          flex: 'none',
          width: taille,
          height: taille,
          background: '#fff',
          maskImage: `url(/pictos/${nom}.svg)`,
          maskSize: 'contain',
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskImage: `url(/pictos/${nom}.svg)`,
          WebkitMaskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          ...style,
        }}
      />
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={`/pictos/${nom}.svg`}
      alt=""
      width={taille}
      height={taille}
      style={{ display: 'block', flex: 'none', objectFit: 'contain', ...style }}
    />
  );
}
