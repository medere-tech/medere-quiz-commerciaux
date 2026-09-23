'use client';

import { useEffect, useRef, useState } from 'react';

import { Bouton, Carte, Meta } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import { usePanneauSuperpose } from '@/lib/navigation/panneau-superpose';
import { seancesAVenirContenant, type Session } from '@/lib/session/depot';
import { titreDeSeance } from '@/lib/session/seance';

/**
 * Supprimer une question de la banque : la corbeille, et ce qu'elle demande
 * avant d'effacer.
 *
 * **Pourquoi un panneau, et non une confirmation dans la rangée.** La première
 * version posait « Supprimer ? », « Annuler » et « Supprimer » à la place des
 * icônes. La colonne d'actions fait une largeur fixe, dessinée pour deux
 * icônes ; trois libellés n'y tiennent pas, et comme rien n'y passe à la ligne,
 * ils se sont superposés. Le défaut ne se voyait pas dans le DOM — les trois
 * nœuds étaient bien là, dans le bon ordre, avec les bons libellés — il ne se
 * voyait qu'à l'écran.
 *
 * Élargir la colonne aurait déplacé le problème : la confirmation la plus large
 * aurait fixé la largeur de la colonne sur toutes les rangées, en volant
 * l'espace de l'énoncé en permanence.
 *
 * **Le panneau ne coûte aucune largeur, et il dit la conséquence.** Une
 * suppression est irréversible : elle mérite la même forme que l'arrêt d'une
 * séance, qui l'est aussi — voir `ArreterSeance`. Fond inerte, focus capté,
 * Échap referme, et le geste nommé avant d'être posé.
 */
export function SupprimerQuestion({
  questionId,
  enonce,
  enCours,
  onSupprimer,
  style,
}: {
  /** L'identifiant, pour retrouver les séances qui contiennent la question. */
  questionId: string;
  /** L'énoncé de la question, cité dans le panneau et dans les libellés. */
  enonce: string;
  /** L'effacement est parti : le panneau reste ouvert, les boutons s'éteignent. */
  enCours: boolean;
  /**
   * Efface. Le panneau se referme quand l'appel rend la main sans lever ;
   * une erreur le laisse ouvert, pour qu'on puisse réessayer sans rouvrir.
   */
  onSupprimer: () => Promise<void>;
  /** Le style de la corbeille, partagé avec les autres commandes de la rangée. */
  style?: React.CSSProperties;
}) {
  const [ouvert, setOuvert] = useState(false);
  const panneau = useRef<HTMLDivElement | null>(null);

  /*
   * **Les séances qui contiennent la question, lues à l'ouverture.**
   *
   * `null` veut dire « pas encore su », et ce n'est pas la même chose qu'un
   * tableau vide. Tant qu'on ne sait pas, le panneau ne dit rien : annoncer
   * « aucune séance » avant d'avoir lu serait la seule erreur qui coûte
   * vraiment quelque chose ici.
   *
   * Une lecture par ouverture, pas une par rangée : la banque affiche des
   * centaines de lignes, et aucune d'elles n'a besoin de cette réponse avant
   * qu'on ait cliqué.
   */
  const [seances, setSeances] = useState<Session[] | null>(null);

  /*
   * **« Je n'ai pas pu vérifier » n'est pas « il n'y a rien ».** Les deux
   * rendaient le panneau muet, donc indiscernables à l'écran — et c'est le
   * `catch` qui efface la panne, décrit dans CLAUDE.md. Une vérification qui
   * n'a pas eu lieu se dit, sinon son silence a l'apparence exacte d'une
   * absence de danger.
   */
  const [lectureEnEchec, setLectureEnEchec] = useState(false);

  useEffect(() => {
    if (!ouvert) return;

    /*
     * **Aucune remise à zéro synchrone ici**, et ce n'est pas qu'une question
     * de règle de lint. `questionId` ne change jamais pour une rangée donnée :
     * ce qu'on a lu la fois précédente porte sur la même question, et reste
     * donc juste. Vider l'état à l'ouverture ne ferait que faire clignoter un
     * avertissement déjà connu.
     */
    let vivant = true;

    seancesAVenirContenant(questionId)
      .then((trouvees) => {
        if (!vivant) return;
        setSeances(trouvees);
        setLectureEnEchec(false);
      })
      .catch(() => {
        if (vivant) setLectureEnEchec(true);
      });

    return () => {
      vivant = false;
    };
  }, [ouvert, questionId]);

  usePanneauSuperpose(ouvert, panneau);

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (evenement: KeyboardEvent) => {
      /* Pas d'échappatoire pendant l'écriture : refermer sur une suppression
         partie laisserait croire qu'elle est annulée, alors qu'elle continue. */
      if (evenement.key === 'Escape' && !enCours) setOuvert(false);
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [ouvert, enCours]);

  async function confirmer() {
    try {
      await onSupprimer();
      setOuvert(false);
    } catch {
      /* L'écran affiche déjà l'échec. Le panneau reste ouvert : rouvrir la
         corbeille pour réessayer serait un geste de plus pour rien. */
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Supprimer : ${enonce}`}
        onClick={() => setOuvert(true)}
        style={style}
      >
        <Icone nom="trash" taille={16} />
      </button>

      {ouvert && (
        <>
          <button
            type="button"
            data-superpose="voile"
            aria-label="Fermer"
            onClick={() => !enCours && setOuvert(false)}
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
            aria-label="Supprimer la question"
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
                  textWrap: 'pretty',
                }}
              >
                Supprimer cette question ?
              </h2>

              {/*
                * L'énoncé est cité, et non résumé. Sur une liste de plusieurs
                * centaines de rangées, la seule question à laquelle le panneau
                * doit répondre est « laquelle ? ».
                *
                * Bordure complète et fond teinté, jamais un filet d'un seul
                * côté — même règle que les issues d'`ArreterSeance`.
                */}
              <Carte
                rayon="var(--radius-md)"
                rembourrage="12px 14px"
                elevation="aucune"
                style={{
                  marginTop: 'var(--space-4)',
                  border: '1px solid rgba(194, 66, 66, 0.35)',
                  background: 'rgba(194, 66, 66, 0.06)',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    fontSize: 'var(--body-sm-size)',
                    lineHeight: 1.45,
                    color: 'var(--text-heading)',
                    textWrap: 'pretty',
                  }}
                >
                  {enonce}
                </span>
              </Carte>

              {/*
                * **L'avertissement qui manquait, et la panne qu'il évite.**
                *
                * Une séance préparée garde l'identifiant de la question qu'on
                * vient d'effacer. Le jeudi, la séance arrive dessus et projette
                * « Cette question n'est plus publiée » devant la salle. Rien
                * n'est cassé au sens technique — l'écran a son état, la suite
                * se poursuit — mais Noémie n'a aucun moyen de comprendre
                * pourquoi, parce que rien ne le lui a dit au moment où elle
                * pouvait encore choisir.
                *
                * Muet tant qu'on ne sait pas, et muet quand il n'y a rien à
                * signaler : un encadré qui dit « aucune séance concernée »
                * ajoute une ligne à lire à chaque suppression sans rien
                * apprendre.
                */}
              {seances !== null && seances.length > 0 && (
                <Carte
                  rayon="var(--radius-md)"
                  rembourrage="12px 14px"
                  elevation="aucune"
                  style={{
                    marginTop: 'var(--space-4)',
                    /*
                     * Teinte dérivée de `--status-warning` (#feca45), faute de
                     * jeton de bordure et de fond pour l'avertissement : le
                     * système n'en publie que pour le danger. Même écriture en
                     * rgba littéral que les issues d'`ArreterSeance`, pour ne
                     * pas inventer un second procédé. À remplacer le jour où
                     * les maquettes couvrent ce cas.
                     *
                     * Bordure complète, jamais un filet d'un seul côté.
                     */
                    border: '1px solid rgba(254, 202, 69, 0.6)',
                    background: 'rgba(254, 202, 69, 0.14)',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      fontSize: 'var(--body-sm-size)',
                      lineHeight: 1.45,
                      color: 'var(--text-heading)',
                      textWrap: 'pretty',
                    }}
                  >
                    <Icone nom="alert" taille={16} />
                    <span>{avertissement(seances)}</span>
                  </span>
                </Carte>
              )}

              {lectureEnEchec && (
                <Meta style={{ display: 'block', marginTop: 'var(--space-4)', fontSize: 13 }}>
                  Impossible de vérifier si une séance préparée contient cette question.
                  Supprimez en connaissance de cause, ou réessayez.
                </Meta>
              )}

              <Meta style={{ display: 'block', marginTop: 'var(--space-4)', fontSize: 13 }}>
                Elle sort de la banque et ne sera plus tirée dans aucune série. C’est définitif :
                il n’y a pas de corbeille.
              </Meta>

              <div
                style={{
                  display: 'flex',
                  gap: 'var(--space-3)',
                  marginTop: 'var(--space-6)',
                  justifyContent: 'flex-end',
                  flexWrap: 'wrap',
                }}
              >
                <Bouton variante="secondaire" disabled={enCours} onClick={() => setOuvert(false)}>
                  Annuler
                </Bouton>
                <Bouton
                  variante="secondaire"
                  disabled={enCours}
                  onClick={() => void confirmer()}
                  style={{
                    color: 'var(--status-danger-texte)',
                    border: '1px solid rgba(194, 66, 66, 0.35)',
                    background: 'rgba(194, 66, 66, 0.06)',
                  }}
                >
                  {enCours ? 'Suppression…' : 'Supprimer'}
                </Bouton>
              </div>
            </Carte>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Ce que dit l'avertissement, selon le nombre de séances.
 *
 * **On nomme tant qu'on peut, on compte quand on ne peut plus.** Un titre de
 * séance situe immédiatement — « la séance du mardi 22 », on sait laquelle
 * c'est. Au-delà de trois, la liste devient plus longue que la phrase et le
 * nombre porte mieux l'alerte : ce qui compte alors n'est plus « laquelle »
 * mais « il y en a beaucoup ».
 */
function avertissement(seances: Session[]): string {
  const titres = seances.map((seance) => `« ${titreDeSeance(seance)} »`);

  if (titres.length === 1) {
    return `Cette question est dans une séance qui n’a pas encore été jouée, ${titres[0]}. La séance arrivera dessus et n’aura rien à afficher.`;
  }

  if (titres.length <= 3) {
    const liste = `${titres.slice(0, -1).join(', ')} et ${titres[titres.length - 1]}`;
    return `Cette question est dans ${titres.length} séances qui n’ont pas encore été jouées : ${liste}. Elles arriveront dessus et n’auront rien à afficher.`;
  }

  return `Cette question est dans ${titres.length} séances qui n’ont pas encore été jouées. Elles arriveront dessus et n’auront rien à afficher.`;
}
