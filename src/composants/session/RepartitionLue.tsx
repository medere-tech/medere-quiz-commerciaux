'use client';

import { Meta } from '@/composants/ds/primitives';
import { partDesRepondants } from '@/lib/session/repartition';

/**
 * La répartition, telle qu'elle a été publiée par l'animatrice.
 *
 * Elle n'est pas recalculée ici : un participant ne lit pas les réponses des
 * autres, et c'est exactement ce qu'on veut. Le tableau qu'il voit est celui
 * que la révélation a figé.
 */
export function RepartitionLue({
  repartition,
  repondants,
  question,
}: {
  /** Un entier par option, dans l'ordre d'affichage. */
  repartition: number[];
  /** Nombre de personnes ayant répondu. Le seul dénominateur valable. */
  repondants: number;
  question: { ordreOptions: string[]; bonnesReponses: string[] };
}) {
  /*
   * Le dénominateur est le nombre de répondants, jamais la somme des comptes.
   * Sur un QCM à deux bonnes réponses, un seul participant qui coche deux
   * options fait une somme de deux — et l'écran annonçait « 2 réponses au
   * total » pour une seule personne.
   */
  if (repondants === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {question.ordreOptions.map((identifiant, index) => {
        const compte = repartition[index] ?? 0;
        const part = partDesRepondants(compte, repondants);
        const juste = question.bonnesReponses.includes(identifiant);

        return (
          <span
            key={identifiant}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                height: 8,
                borderRadius: 999,
                background: 'var(--surface-sunken)',
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  display: 'block',
                  width: `${part}%`,
                  height: '100%',
                  background: juste ? 'var(--status-success)' : 'var(--neutral-30)',
                }}
              />
            </span>
            <span
              style={{
                flex: 'none',
                width: 44,
                textAlign: 'right',
                fontSize: 'var(--body-sm-size)',
                fontWeight: 600,
                color: 'var(--text-heading)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {part} %
            </span>
          </span>
        );
      })}
      <Meta style={{ fontSize: 12 }}>
        {repondants} personne{repondants > 1 ? 's' : ''} {repondants > 1 ? 'ont' : 'a'} répondu.
      </Meta>
    </div>
  );
}
