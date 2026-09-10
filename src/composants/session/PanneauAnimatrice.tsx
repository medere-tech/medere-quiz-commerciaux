'use client';

import { Meta } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import type { Question } from '@/lib/questions/depot';
import type { Participant, ReponseSession } from '@/lib/session/depot';

/**
 * Le panneau de l'animatrice, à côté de la scène.
 *
 * **La seule vue nominative de tout l'outil.** Les règles réservent la lecture
 * des réponses de séance à l'animatrice — décision assumée du lot 1 : c'est
 * l'intérêt même de l'exercice collectif, et les participants étaient dans la
 * même pièce. Partout ailleurs, personne ne voit qui a raté quoi.
 *
 * **Elle lit ce panneau sur son propre écran, pas sur le mur.** D'où des
 * tailles ordinaires ici, quand la scène est dessinée pour la distance. Un nom
 * de trente-deux caractères y tient sans pousser la lettre choisie hors du
 * cadre : c'est la borne, et elle a été essayée.
 */
export function PanneauAnimatrice({
  participants,
  reponses,
  question,
  revelee,
}: {
  participants: Participant[];
  /** Réponses de la question en cours, uniquement. */
  reponses: ReponseSession[];
  question: Question | null;
  revelee: boolean;
}) {
  return (
    <aside className="session-panneau">
      <span
        style={{ fontSize: 'var(--body-sm-size)', fontWeight: 600, color: 'var(--text-heading)' }}
      >
        Participants
      </span>
      <Meta style={{ fontSize: 12 }}>
        {reponses.length} sur {participants.length} ont répondu
      </Meta>

      <div
        style={{
          marginTop: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {participants.length === 0 && (
          <Meta style={{ fontSize: 12 }}>Personne n’a encore rejoint la séance.</Meta>
        )}

        {participants.map((participant) => {
          const sienne = reponses.find((reponse) => reponse.uid === participant.uid);
          const lettres = sienne
            ? (question?.ordreOptions ?? [])
                .map((identifiant, index) =>
                  sienne.optionsChoisies.includes(identifiant)
                    ? String.fromCharCode(65 + index)
                    : null,
                )
                .filter(Boolean)
                .join(' ')
            : null;

          return (
            <span
              key={participant.uid}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background:
                  sienne == null
                    ? 'var(--surface-page)'
                    : sienne.correcte
                      ? 'rgba(45,161,49,0.09)'
                      : 'rgba(194,66,66,0.07)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 22,
                  height: 22,
                  flex: 'none',
                  borderRadius: 999,
                  background:
                    sienne == null
                      ? 'var(--neutral-30)'
                      : sienne.correcte
                        ? 'var(--status-success)'
                        : 'var(--status-danger)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {sienne && <Icone nom={sienne.correcte ? 'check' : 'close'} taille={12} />}
              </span>

              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 'var(--body-sm-size)',
                  color: sienne == null ? 'var(--text-secondary)' : 'var(--text-body)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={participant.nom}
              >
                {participant.nom}
              </span>

              <span
                style={{
                  flex: 'none',
                  fontSize: 12,
                  fontWeight: sienne ? 600 : 400,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {sienne == null ? 'en attente' : lettres}
              </span>
            </span>
          );
        })}
      </div>

      {revelee && question && (
        <div style={{ marginTop: 'auto', paddingTop: 'var(--space-5)', flex: 'none' }}>
          <span
            style={{
              display: 'block',
              fontSize: 'var(--body-sm-size)',
              fontWeight: 600,
              color: 'var(--text-heading)',
              marginBottom: 8,
            }}
          >
            Explication
          </span>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--body-sm-size)',
              lineHeight: 1.55,
              color: 'var(--neutral-70)',
              textWrap: 'pretty',
            }}
          >
            {question.explication}
          </p>
        </div>
      )}
    </aside>
  );
}
