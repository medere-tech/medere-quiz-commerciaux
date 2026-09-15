'use client';

import { useCallback, useState } from 'react';

import { Bouton, Carte, EtiquetteStatut, Meta, TitreSection } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import { Jauge } from '@/composants/ds/parcours';
import type { Question } from '@/lib/questions/depot';
import { chargerBilan, type LigneBilan, type Session } from '@/lib/session/depot';

/**
 * Les séances passées, côté animatrice.
 *
 * **Ce n'est pas une commodité.** Ce qui a trébuché la semaine dernière
 * détermine ce qu'on repose la semaine suivante, et cette information
 * disparaissait entièrement à la fin de la séance : ni les questions posées, ni
 * les taux. Préparer le jeudi revenait à se souvenir.
 *
 * **Les scores individuels restent privés.** Le bilan est écrit par la Cloud
 * Function, agrégé, sans aucun identifiant — deux compteurs par question. Ce
 * n'est pas une convention d'affichage : la lecture nominative des votes
 * s'éteint avec la séance, les règles le vérifient, et cinq tests le tiennent.
 * Le classement nominatif, lui, reste dans la séance.
 *
 * Le bilan n'est chargé qu'à l'ouverture d'une séance : une animatrice regarde
 * la dernière, pas les vingt précédentes.
 */

const CLOSES = ['terminee', 'abandonnee'];

function dateLongue(millisecondes: number | null): string {
  if (millisecondes === null) return 'date inconnue';
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(millisecondes));
}

export function HistoriqueSeances({
  seances,
  questions,
}: {
  seances: Session[];
  /** Pour retrouver l'énoncé : le bilan ne porte que des identifiants. */
  questions: Question[];
}) {
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [bilans, setBilans] = useState<Record<string, LigneBilan[] | 'echec'>>({});

  const ouvrir = useCallback(
    async (sessionId: string) => {
      if (ouverte === sessionId) {
        setOuverte(null);
        return;
      }
      setOuverte(sessionId);
      if (bilans[sessionId]) return;

      try {
        const bilan = await chargerBilan(sessionId);
        setBilans((actuels) => ({ ...actuels, [sessionId]: bilan ?? [] }));
      } catch {
        setBilans((actuels) => ({ ...actuels, [sessionId]: 'echec' }));
      }
    },
    [ouverte, bilans],
  );

  const passees = seances
    .filter((seance) => CLOSES.includes(seance.statut))
    .sort((a, b) => (b.creeeLeMs ?? 0) - (a.creeeLeMs ?? 0));

  if (passees.length === 0) return null;

  return (
    <div>
      <TitreSection indice={`${passees.length} séance${passees.length > 1 ? 's' : ''}`}>
        Séances passées
      </TitreSection>

      <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {passees.map((seance) => {
          const bilan = bilans[seance.id];
          const affichee = ouverte === seance.id;

          return (
            <Carte
              key={seance.id}
              rayon="var(--radius-lg)"
              rembourrage="14px 18px"
              elevation="petite"
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-4)',
                  flexWrap: 'wrap',
                }}
              >
                {seance.statut === 'abandonnee' && (
                  <EtiquetteStatut ton="attention">Interrompue</EtiquetteStatut>
                )}
                <span style={{ flex: 1, minWidth: 160 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 'var(--body-md-size)',
                      fontWeight: 600,
                      color: 'var(--text-heading)',
                    }}
                  >
                    {dateLongue(seance.creeeLeMs)}
                  </span>
                  <Meta style={{ fontSize: 12 }}>
                    {seance.questionIds.length} question{seance.questionIds.length > 1 ? 's' : ''} ·
                    code {seance.code}
                  </Meta>
                </span>
                <Bouton
                  variante="secondaire"
                  taille="sm"
                  onClick={() => void ouvrir(seance.id)}
                  iconeDroite={
                    <span
                      style={{
                        display: 'flex',
                        transform: affichee ? 'rotate(90deg)' : 'none',
                        transition: 'transform var(--duration-base) var(--ease-standard)',
                      }}
                    >
                      <Icone nom="chevronRight" taille={14} />
                    </span>
                  }
                >
                  {affichee ? 'Replier' : 'Ce qui a trébuché'}
                </Bouton>
              </div>

              {affichee && (
                <div style={{ marginTop: 'var(--space-4)' }}>
                  {bilan === undefined && <Meta style={{ fontSize: 12 }}>Lecture du bilan…</Meta>}

                  {bilan === 'echec' && (
                    <Meta style={{ fontSize: 12 }}>
                      Le bilan de cette séance n’a pas pu être lu.
                    </Meta>
                  )}

                  {Array.isArray(bilan) && bilan.length === 0 && (
                    <Meta style={{ fontSize: 12 }}>
                      Aucun bilan : cette séance est antérieure à leur mise en service.
                    </Meta>
                  )}

                  {Array.isArray(bilan) && bilan.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[...bilan]
                        // Ce qui a le plus trébuché d'abord : c'est la seule
                        // question qu'on se pose en ouvrant cet écran.
                        .sort((a, b) => tauxEchec(b) - tauxEchec(a))
                        .map((ligne) => {
                          const question = questions.find(
                            (candidate) => candidate.id === ligne.questionId,
                          );
                          const taux = tauxEchec(ligne);

                          return (
                            <span
                              key={ligne.questionId}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-4)',
                                flexWrap: 'wrap',
                              }}
                            >
                              <span style={{ flex: 1, minWidth: 180 }}>
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
                                  {question?.enonce ?? 'Question supprimée depuis'}
                                </span>
                                <Meta style={{ fontSize: 12 }}>
                                  {ligne.reponses === 0
                                    ? 'jamais posée — la séance s’est arrêtée avant'
                                    : `${ligne.echecs} échec${ligne.echecs > 1 ? 's' : ''} sur ${ligne.reponses} réponse${ligne.reponses > 1 ? 's' : ''}`}
                                </Meta>
                              </span>
                              <span style={{ flex: 'none', width: 110 }}>
                                <Jauge
                                  valeur={taux}
                                  ton={taux > 50 ? 'var(--status-danger)' : 'var(--neutral-30)'}
                                  hauteur={5}
                                />
                              </span>
                              <span
                                style={{
                                  flex: 'none',
                                  width: 42,
                                  textAlign: 'right',
                                  fontSize: 'var(--body-sm-size)',
                                  fontWeight: 600,
                                  color: 'var(--text-heading)',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {ligne.reponses === 0 ? '—' : `${taux} %`}
                              </span>
                            </span>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </Carte>
          );
        })}
      </div>
    </div>
  );
}

function tauxEchec(ligne: LigneBilan): number {
  return ligne.reponses === 0 ? 0 : Math.round((ligne.echecs / ligne.reponses) * 100);
}
