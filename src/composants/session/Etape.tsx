import type { ReactNode } from 'react';

/**
 * Le titre d'une étape de composition.
 *
 * **Un numéro et un verbe.** « Choisissez les questions », pas « Questions » :
 * on doit savoir quoi faire sans avoir à le deviner, et l'ordre des trois
 * étapes est une information à part entière — la maquette les numérote pour
 * ça.
 *
 * Aucune majuscule de surtitre, aucun filet : la pastille et la graisse
 * suffisent à marquer le niveau.
 */
export function Etape({
  numero,
  children,
  aside,
  id,
}: {
  numero: number;
  children: ReactNode;
  /** Ce qui s'aligne à droite du titre — un compteur, le plus souvent. */
  aside?: ReactNode;
  id?: string;
}) {
  return (
    <div className="etape">
      <span className="etape-numero" aria-hidden="true">
        {numero}
      </span>
      <h2 className="etape-titre" id={id}>
        {children}
      </h2>
      {aside && <span style={{ marginLeft: 'auto', flex: 'none' }}>{aside}</span>}
    </div>
  );
}
