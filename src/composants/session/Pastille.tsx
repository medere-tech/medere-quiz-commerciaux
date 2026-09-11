'use client';

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
  taille?: number;
  /** Infobulle, quand le nom n'est pas déjà écrit à côté. */
  titre?: string;
}) {
  const teinte = AVATARS[avatarOuDefaut(avatar)];

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
        fontSize: Math.round(taille * 0.42),
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

/** Les huit teintes, en ligne, pour le choix au moment de rejoindre. */
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
    <div role="radiogroup" aria-label="Votre couleur" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {(Object.keys(AVATARS) as (keyof typeof AVATARS)[]).map((cle) => {
        const actif = cle === choisi;
        return (
          <button
            key={cle}
            type="button"
            role="radio"
            aria-checked={actif}
            aria-label={AVATARS[cle].libelle}
            onClick={() => onChoisir(cle)}
            style={{
              padding: 3,
              borderRadius: 999,
              // Bordure complète, jamais un filet : c'est l'anneau qui dit le
              // choix, et il fait tout le tour.
              border: `2px solid ${actif ? 'var(--neutral-100)' : 'transparent'}`,
              background: 'transparent',
              cursor: 'pointer',
              lineHeight: 0,
            }}
          >
            <Pastille nom={nom} avatar={cle} taille={38} />
          </button>
        );
      })}
    </div>
  );
}
