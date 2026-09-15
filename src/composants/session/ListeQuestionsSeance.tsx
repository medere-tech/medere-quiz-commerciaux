'use client';

import { Meta } from '@/composants/ds/primitives';
import { FormeFormation } from '@/composants/ds/parcours';
import type { Formation } from '@/lib/formations/depot';
import { identiteVisuelle } from '@/lib/formations/depot';
import type { Question } from '@/lib/questions/depot';
import { LIBELLES_TYPE } from '@/lib/questions/modele';

/**
 * La liste de questions qu'on coche pour composer une séance.
 *
 * **Le numéro dans la case est l'ordre de passage.** Elles seront posées dans
 * l'ordre où on les coche, pas dans celui de la liste : c'est ce qui permet de
 * commencer par la question dont on vient de parler.
 *
 * **« Déjà posée le… » signale, il ne bloque pas.** Reposer une question mal
 * comprise est exactement ce qu'on veut pouvoir faire ; la reposer sans s'en
 * rendre compte, non.
 *
 * Séparée de l'écran pour la même raison que la scène projetée : ce qui ne se
 * vérifie qu'avec une session administrateur ouverte ne se vérifie jamais.
 */
export function ListeQuestionsSeance({
  questions,
  formations,
  choisies,
  derniereFois,
  onBasculer,
}: {
  questions: Question[];
  formations: Formation[];
  /** Identifiants retenus, dans l'ordre de sélection. */
  choisies: string[];
  /** Dernière fois que chaque question a été posée, en millisecondes. */
  derniereFois: Map<string, number>;
  onBasculer: (identifiant: string) => void;
}) {
  return (
          <div
            style={{
              marginTop: 'var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {questions.map((question) => {
              const rang = choisies.indexOf(question.id);
              const prise = rang >= 0;
              const formationLiee = formations.find((f) =>
                question.formationIds.includes(f.id),
              );

              return (
                <button
                  key={question.id}
                  type="button"
                  aria-pressed={prise}
                  onClick={() => onBasculer(question.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-4)',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: prise ? 'var(--surface-chip)' : 'var(--surface-card)',
                    border: '1px solid ' + (prise ? 'var(--border-strong)' : 'transparent'),
                    boxShadow: prise ? 'none' : 'var(--shadow-card-sm)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    font: 'inherit',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 26,
                      height: 26,
                      flex: 'none',
                      borderRadius: 'var(--radius-sm)',
                      background: prise ? 'var(--neutral-100)' : 'transparent',
                      border: '1px solid ' + (prise ? 'var(--neutral-100)' : 'var(--border-default)'),
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {prise ? rang + 1 : ''}
                  </span>

                  {formationLiee && (
                    <FormeFormation fichier={identiteVisuelle(formationLiee).fichier} taille={22} />
                  )}

                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 'var(--body-sm-size)',
                        color: 'var(--text-body)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {question.enonce}
                    </span>
                    <Meta style={{ fontSize: 12 }}>
                      {LIBELLES_TYPE[question.type]}
                      {(() => {
                        const posee = derniereFois.get(question.id);
                        return posee === undefined
                          ? ''
                          : ` · déjà posée le ${new Intl.DateTimeFormat('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                            }).format(new Date(posee))}`;
                      })()}
                    </Meta>
                  </span>
                </button>
              );
            })}
          </div>
  );
}
