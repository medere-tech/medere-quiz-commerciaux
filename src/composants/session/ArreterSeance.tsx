'use client';

import { useEffect, useRef, useState } from 'react';

import { Bouton, Carte, Meta } from '@/composants/ds/primitives';
import { usePanneauSuperpose } from '@/lib/navigation/panneau-superpose';

/**
 * Arrêter une séance : deux gestes, deux conséquences.
 *
 * **Ce ne sont pas deux formulations d'une même chose.** La réunion déborde et
 * l'on a joué cinq questions sur huit : la séance se **termine**, et le
 * classement porte sur ce qui a été joué — il est légitime. La visioconférence
 * tombe, une question se révèle inutilisable, la moitié de la salle est partie :
 * la séance s'**abandonne**, et rien n'est classé, parce que le résultat ne
 * voudrait rien dire.
 *
 * Le panneau dit la conséquence avant le geste, et pas après. Une animatrice
 * devant une salle ne lit pas deux fois.
 *
 * Il s'appuie sur `usePanneauSuperpose` : le fond devient inerte, le focus entre
 * dans le panneau et revient au bouton à la fermeture. Échap referme.
 */
export function ArreterSeance({
  onTerminer,
  onAbandonner,
  questionsJouees,
  questionsTotal,
}: {
  onTerminer: () => void;
  onAbandonner: () => void;
  /** Numéro de la question en cours : ce qui aura été joué si l'on termine ici. */
  questionsJouees: number;
  questionsTotal: number;
}) {
  const [ouvert, setOuvert] = useState(false);
  const panneau = useRef<HTMLDivElement | null>(null);

  usePanneauSuperpose(ouvert, panneau);

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') setOuvert(false);
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [ouvert]);

  return (
    <>
      <Bouton
        taille="lg"
        variante="inverse"
        onClick={() => setOuvert(true)}
        style={{ border: '1px solid rgba(255,255,255,0.32)' }}
      >
        Arrêter
      </Bouton>

      {ouvert && (
        <>
          <button
            type="button"
            data-superpose="voile"
            aria-label="Fermer"
            onClick={() => setOuvert(false)}
            style={{
              position: 'fixed',
              inset: 0,
              border: 'none',
              background: 'rgba(2, 32, 32, 0.55)',
              cursor: 'pointer',
              zIndex: 40,
            }}
          />

          <div
            ref={panneau}
            role="dialog"
            aria-modal="true"
            aria-label="Arrêter la séance"
            style={{
              position: 'fixed',
              zIndex: 41,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(460px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 32px)',
              overflowY: 'auto',
            }}
          >
            <Carte rayon="var(--radius-xl)" rembourrage="24px" elevation="haute">
              <h2
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-display)',
                  fontWeight: 400,
                  fontSize: 'clamp(22px, 5vw, 26px)',
                  lineHeight: 1.15,
                  color: 'var(--text-heading)',
                }}
              >
                Arrêter la séance
              </h2>

              <div
                style={{
                  marginTop: 'var(--space-5)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-5)',
                }}
              >
                <div>
                  <Bouton
                    pleineLargeur
                    onClick={() => {
                      setOuvert(false);
                      onTerminer();
                    }}
                  >
                    Terminer et classer
                  </Bouton>
                  <Meta style={{ fontSize: 13 }}>
                    Le classement porte sur les {questionsJouees} question
                    {questionsJouees > 1 ? 's' : ''} jouée{questionsJouees > 1 ? 's' : ''} sur{' '}
                    {questionsTotal}. Les prix sont attribués.
                  </Meta>
                </div>

                <div>
                  <Bouton
                    pleineLargeur
                    variante="secondaire"
                    onClick={() => {
                      setOuvert(false);
                      onAbandonner();
                    }}
                  >
                    Abandonner sans classer
                  </Bouton>
                  <Meta style={{ fontSize: 13 }}>
                    Aucun classement, aucun prix. Les réponses déjà données restent dans la
                    progression de chacun. C’est définitif : pour recommencer, préparez une
                    nouvelle séance.
                  </Meta>
                </div>

                <Bouton pleineLargeur variante="fantome" onClick={() => setOuvert(false)}>
                  Revenir à la séance
                </Bouton>
              </div>
            </Carte>
          </div>
        </>
      )}
    </>
  );
}
