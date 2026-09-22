'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Bouton, Carte, Meta } from '@/composants/ds/primitives';
import { Icone, type NomIcone } from '@/composants/ds/Icone';
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
 *
 * **Deux présentations, un seul texte.** La scène projetée et la salle
 * d'attente ne se ressemblent pas — fond encre contre fond clair, panneau
 * étroit contre panneau large — mais les libellés et les conséquences sont les
 * mêmes, et c'est la raison de n'avoir qu'un composant. Deux formulations d'un
 * même geste irréversible seraient pires que deux écrans.
 */
export function ArreterSeance({
  onTerminer,
  onAbandonner,
  questionsJouees,
  questionsTotal,
  presentation = 'scene',
}: {
  onTerminer: () => void;
  onAbandonner: () => void;
  /** Numéro de la question en cours : ce qui aura été joué si l'on termine ici. */
  questionsJouees: number;
  questionsTotal: number;
  /**
   * `scene` — la scène projetée, sur le fond encre : bouton inversé, panneau
   * étroit. C'est l'écran 10d, et il ne change pas.
   * `salle` — la salle d'attente, sur fond clair : bouton secondaire, panneau
   * large, chaque issue dans son propre encadré.
   */
  presentation?: 'scene' | 'salle';
}) {
  const [ouvert, setOuvert] = useState(false);
  const panneau = useRef<HTMLDivElement | null>(null);
  const enSalle = presentation === 'salle';

  usePanneauSuperpose(ouvert, panneau);

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') setOuvert(false);
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [ouvert]);

  /** « 3 questions sur 8 ont été jouées. » — ou le cas où rien n'a commencé. */
  const bilan =
    questionsJouees === 0
      ? 'Aucune question n’a encore été posée. Choisissez ce qui arrive à la séance.'
      : `${questionsJouees} question${questionsJouees > 1 ? 's' : ''} sur ${questionsTotal} ` +
        `${questionsJouees > 1 ? 'ont' : 'a'} été jouée${questionsJouees > 1 ? 's' : ''}. ` +
        'Choisissez ce qui arrive aux réponses déjà données.';

  const consequenceTerminer =
    questionsJouees === 0
      ? 'Aucune question n’a été jouée : le classement serait vide. Préférez l’abandon.'
      : `Le classement porte sur les ${questionsJouees} question` +
        `${questionsJouees > 1 ? 's' : ''} jouée${questionsJouees > 1 ? 's' : ''} sur ` +
        `${questionsTotal}. Les prix sont attribués.`;

  return (
    <>
      {enSalle ? (
        <Bouton
          taille="lg"
          variante="secondaire"
          onClick={() => setOuvert(true)}
          iconeGauche={<Icone nom="close" taille={18} />}
          style={{ fontSize: 'var(--sa-btn)', padding: 'var(--sa-btn-pad)' }}
        >
          Arrêter la séance
        </Bouton>
      ) : (
        <Bouton
          taille="lg"
          variante="inverse"
          onClick={() => setOuvert(true)}
          style={{ border: '1px solid rgba(255,255,255,0.32)' }}
        >
          Arrêter
        </Bouton>
      )}

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
              width: enSalle
                ? 'min(1000px, calc(100vw - 48px))'
                : 'min(460px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 32px)',
              overflowY: 'auto',
            }}
          >
            <Carte
              rayon={enSalle ? 'var(--radius-2xl)' : 'var(--radius-xl)'}
              rembourrage={enSalle ? 'clamp(24px, 3vw, 44px) clamp(22px, 3vw, 48px)' : '24px'}
              elevation="haute"
            >
              <h2
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-display)',
                  fontWeight: 400,
                  fontSize: enSalle ? 'var(--sa-titre)' : 'clamp(22px, 5vw, 26px)',
                  lineHeight: 1.15,
                  color: 'var(--text-heading)',
                }}
              >
                Arrêter la séance{enSalle ? ' ?' : ''}
              </h2>

              {enSalle && (
                <p
                  style={{
                    margin: '12px 0 0',
                    fontSize: 'var(--sa-desc)',
                    lineHeight: 1.55,
                    color: 'var(--neutral-70)',
                    textWrap: 'pretty',
                  }}
                >
                  {bilan}
                </p>
              )}

              <div
                style={{
                  marginTop: enSalle ? 28 : 'var(--space-5)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: enSalle ? 12 : 'var(--space-5)',
                }}
              >
                <Issue
                  enSalle={enSalle}
                  titre="Terminer et classer"
                  bouton="Terminer et classer"
                  icone="award"
                  onChoisir={() => {
                    setOuvert(false);
                    onTerminer();
                  }}
                >
                  {consequenceTerminer}
                </Issue>

                <Issue
                  enSalle={enSalle}
                  danger
                  titre="Abandonner sans classer"
                  bouton="Abandonner"
                  icone="trash"
                  onChoisir={() => {
                    setOuvert(false);
                    onAbandonner();
                  }}
                >
                  {/*
                   * **Les deux moitiés comptent, et l'une sans l'autre ment.**
                   *
                   * Les réponses *de la séance* sont effacées : elles ne
                   * servaient qu'au classement, il n'y en aura pas, et une
                   * séance abandonnée ne laisse rien de nominatif derrière
                   * elle. Mais la progression de chacun est conservée — ces
                   * réponses étaient réelles, elles comptent dans les questions
                   * à revoir comme n'importe quelle réponse d'entraînement.
                   *
                   * Dire seulement « les réponses sont effacées » ferait croire
                   * qu'on punit ceux qui avaient répondu ; dire seulement « la
                   * progression est conservée » cacherait ce qui part. Les deux
                   * phrases sont donc là, dans cet ordre.
                   */}
                  Les réponses de la séance sont effacées, et il n’y a ni classement ni prix.
                  La progression de chacun est conservée : ce qui a été répondu reste dans les
                  questions à revoir. C’est définitif — pour recommencer, préparez une nouvelle
                  séance.
                </Issue>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: enSalle ? 'flex-end' : 'stretch',
                    marginTop: enSalle ? 10 : 0,
                  }}
                >
                  <Bouton
                    pleineLargeur={!enSalle}
                    variante="fantome"
                    onClick={() => setOuvert(false)}
                    style={enSalle ? { fontSize: 'var(--sa-btn)' } : undefined}
                  >
                    {enSalle ? 'Continuer la séance' : 'Revenir à la séance'}
                  </Bouton>
                </div>
              </div>
            </Carte>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Une issue, et sa conséquence.
 *
 * **La conséquence est écrite à côté du bouton, jamais après le clic.** Sur la
 * scène projetée elle vit sous le bouton ; dans la salle d'attente, à sa gauche
 * dans un encadré. C'est le même texte dans les deux cas.
 */
function Issue({
  enSalle,
  danger = false,
  titre,
  bouton,
  icone,
  children,
  onChoisir,
}: {
  enSalle: boolean;
  danger?: boolean;
  titre: string;
  bouton: string;
  icone: NomIcone;
  children: ReactNode;
  onChoisir: () => void;
}) {
  if (!enSalle) {
    return (
      <div>
        <Bouton pleineLargeur variante={danger ? 'secondaire' : 'primaire'} onClick={onChoisir}>
          {titre}
        </Bouton>
        <Meta style={{ fontSize: 13 }}>{children}</Meta>
      </div>
    );
  }

  return (
    <Carte
      rayon="var(--radius-lg)"
      rembourrage="clamp(18px, 2vw, 24px) clamp(18px, 2vw, 26px)"
      elevation="aucune"
      style={{
        // Bordure complète, jamais un filet d'un seul côté.
        border: danger ? '1px solid rgba(194, 66, 66, 0.35)' : '1px solid var(--border-strong)',
        background: danger ? 'rgba(194, 66, 66, 0.06)' : 'transparent',
      }}
    >
      <div className="arreter-issue">
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 'var(--sa-head)',
              fontWeight: 600,
              color: danger ? 'var(--status-danger-texte)' : 'var(--neutral-100)',
            }}
          >
            {titre}
          </span>
          <span
            style={{
              display: 'block',
              marginTop: 6,
              fontSize: 'var(--sa-meta-l)',
              lineHeight: 1.5,
              color: 'var(--neutral-70)',
            }}
          >
            {children}
          </span>
        </span>
        <Bouton
          taille="lg"
          variante={danger ? 'secondaire' : 'primaire'}
          onClick={onChoisir}
          iconeGauche={<Icone nom={icone} taille={18} />}
          style={{ fontSize: 'var(--sa-btn)', whiteSpace: 'nowrap', flex: 'none' }}
        >
          {bouton}
        </Bouton>
      </div>
    </Carte>
  );
}
