'use client';

import { Bouton, Meta } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';

/**
 * Pied de liste : où on en est, et de quoi en voir plus.
 *
 * **Pourquoi « charger plus » et non des numéros de page.** Les deux listes du
 * back-office sont filtrées et cherchées dans le navigateur — Firestore ne
 * sait pas chercher dans un texte. Une pagination numérotée porterait donc
 * sur un tableau déjà en mémoire : des numéros de page qui n'économisent
 * aucune lecture, et qui obligent à retenir sur quelle page on était. Le
 * compte affiché fait le même travail sans rien demander à personne.
 *
 * Le compte est toujours visible, même quand tout tient à l'écran : « 12 sur
 * 12 » est une information, pas du bruit. Ce qui inquiète, c'est une liste
 * dont on ne sait pas si elle est complète.
 */
export function ChargerPlus({
  affichees,
  total,
  parPage,
  onPlus,
  nom,
}: {
  affichees: number;
  total: number;
  /** Combien de lignes de plus au prochain clic. */
  parPage: number;
  onPlus: () => void;
  /** Nom pluriel de ce qui est listé : « questions », « formations ». */
  nom: string;
}) {
  if (total === 0) return null;

  const reste = total - affichees;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
        padding: 'var(--space-5) 0 var(--space-2)',
      }}
    >
      {reste > 0 && (
        <Bouton
          variante="secondaire"
          iconeGauche={<Icone nom="chevronDown" taille={16} />}
          onClick={onPlus}
        >
          {`Voir ${Math.min(parPage, reste)} ${nom} de plus`}
        </Bouton>
      )}
      <Meta aria-live="polite">
        {reste > 0
          ? `${affichees} ${nom} sur ${total}`
          : `${total} ${nom}, tout est affiché.`}
      </Meta>
    </div>
  );
}
