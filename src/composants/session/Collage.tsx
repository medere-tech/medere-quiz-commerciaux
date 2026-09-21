import type { CSSProperties } from 'react';

/**
 * Collage de formes de la marque.
 *
 * **Décor, et rien d'autre.** Les formes débordent toujours d'un bord et ne
 * passent jamais sous du texte : c'est la règle du système, reprise telle quelle
 * de `ui.jsx`. Le conteneur est `aria-hidden` et ne reçoit aucun clic.
 *
 * Les positions viennent de la maquette et sont données pour une scène de
 * 1440 × 900. Sur un écran plus étroit, elles sont simplement rognées par
 * l'`overflow: hidden` du parent — une forme qu'on ne voit plus n'enlève rien à
 * la page, alors qu'une forme redimensionnée au prorata deviendrait une tache.
 */
export type FormePosee = {
  /** Nom du fichier dans `public/formes`, teinte comprise. */
  fichier: string;
  taille: number;
  x: number;
  y: number;
  rotation?: number;
  opacite?: number;
};

export function Collage({
  formes,
  style,
}: {
  formes: FormePosee[];
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        ...style,
      }}
    >
      {formes.map((forme) => (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={`${forme.fichier}-${forme.x}-${forme.y}`}
          src={`/formes/${forme.fichier}`}
          alt=""
          width={forme.taille}
          height={forme.taille}
          style={{
            position: 'absolute',
            left: forme.x,
            top: forme.y,
            objectFit: 'contain',
            opacity: forme.opacite ?? 1,
            transform: forme.rotation ? `rotate(${forme.rotation}deg)` : undefined,
          }}
        />
      ))}
    </div>
  );
}
