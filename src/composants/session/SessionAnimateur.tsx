'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Bouton, Meta } from '@/composants/ds/primitives';
import { EtatVide, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { Chronometre } from '@/composants/session/Chronometre';
import { RevelationClassement } from '@/composants/session/RevelationClassement';
import type { Referentiel } from '@/composants/parcours/donnees';
import { authentification } from '@/lib/firebase/client';
import { LIBELLES_TYPE } from '@/lib/questions/modele';
import type { Question } from '@/lib/questions/depot';
import {
  creerSession,
  ecouterClassement,
  ecouterParticipants,
  ecouterReponses,
  ecouterSession,
  maSessionEnCours,
  questionSuivante,
  rejouerLeVote,
  revelerReponse,
  terminerSession,
  type Participant,
  type Rang,
  type ReponseSession,
  type Session,
} from '@/lib/session/depot';

/**
 * 10b · Session collective, côté animatrice.
 *
 * **Cet écran est projeté sur un mur, devant dix personnes, à plusieurs
 * mètres.** Ce n'est pas un écran de bureau, et les tailles du système de
 * design n'y suffisent pas : la question monte jusqu'à 56 pixels, les options
 * jusqu'à 26, le tout sur le fond encre de la marque. Rien d'important n'est
 * écrit en dessous de 18 pixels, et ce qui l'est — la liste des participants —
 * vit sur le panneau latéral, que l'animatrice lit sur son propre écran.
 *
 * **La liste nominative est la seule vue de ce genre dans tout l'outil.** Les
 * règles la réservent à l'animatrice, décision assumée du lot 1 : c'est
 * l'intérêt même de l'exercice collectif, et les participants étaient dans la
 * même pièce.
 *
 * **Fermer cet onglet ne casse rien.** Tout l'état vit dans Firestore ; à la
 * réouverture, la séance en cours est retrouvée telle qu'elle était.
 */

const SUR_ENCRE = 'rgba(255,255,255,0.72)';

export function SessionAnimateur({ referentiel }: { referentiel: Referentiel }) {
  const [uid, setUid] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [reponses, setReponses] = useState<ReponseSession[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [classement, setClassement] = useState<Rang[] | null>(null);
  const [recherche, setRecherche] = useState(true);
  const [duree, setDuree] = useState(45);

  useEffect(() => authentification().onAuthStateChanged((u) => setUid(u?.uid ?? null)), []);

  // Reprise : la séance en cours est dans la base, pas dans cet onglet.
  useEffect(() => {
    if (!uid) return;
    let vivant = true;
    void maSessionEnCours(uid).then((trouvee) => {
      if (!vivant) return;
      if (trouvee) setSessionId(trouvee.id);
      setRecherche(false);
    });
    return () => {
      vivant = false;
    };
  }, [uid]);

  useEffect(() => {
    if (!sessionId) return;
    const arrets = [
      ecouterSession(sessionId, (etat) => setSession(etat)),
      ecouterReponses(sessionId, setReponses),
      ecouterParticipants(sessionId, setParticipants),
    ];
    return () => arrets.forEach((arret) => arret());
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || session?.statut !== 'terminee') return;
    return ecouterClassement(sessionId, setClassement);
  }, [sessionId, session?.statut]);

  const question: Question | null = useMemo(() => {
    if (!session) return null;
    const identifiant = session.questionIds[session.indexCourant];
    return referentiel.questions.find((candidate) => candidate.id === identifiant) ?? null;
  }, [session, referentiel.questions]);

  const reponsesCourantes = useMemo(
    () => reponses.filter((reponse) => reponse.questionId === question?.id),
    [reponses, question?.id],
  );

  /** La répartition est calculée ici, puis publiée : le participant la reçoit. */
  const reveler = useCallback(async () => {
    if (!session || !question) return;
    const comptes = question.ordreOptions.map(
      (identifiant) =>
        reponsesCourantes.filter((reponse) => reponse.optionsChoisies.includes(identifiant)).length,
    );
    await revelerReponse(session.id, comptes, reponsesCourantes.length);
  }, [session, question, reponsesCourantes]);

  if (!uid || recherche) {
    return (
      <div style={{ padding: 'clamp(20px, 3.2vw, 36px)' }}>
        <Squelettes lignes={3} />
      </div>
    );
  }

  /* ------------------------------------------------------- ouvrir une séance */

  if (!sessionId || !session) {
    const publiees = referentiel.questions.filter((candidate) => candidate.statut === 'publiee');

    return (
      <div style={{ padding: 'clamp(20px, 3.2vw, 36px)', maxWidth: 620, margin: '0 auto' }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(26px, 5vw, 34px)',
            lineHeight: 1.14,
            color: 'var(--text-heading)',
          }}
        >
          Ouvrir la session du jeudi
        </h1>
        <p
          style={{
            margin: '12px 0 24px',
            fontSize: 'var(--body-md-size)',
            lineHeight: 1.55,
            color: 'var(--neutral-70)',
          }}
        >
          Les huit questions les plus ratées composent la séance. Le code s’affiche en grand dès
          l’ouverture : annoncez-le à voix haute.
        </p>

        {publiees.length === 0 ? (
          <EtatVide
            icone="layers"
            titre="Aucune question publiée"
            texte="Publiez des questions pour pouvoir animer une séance."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span style={{ fontSize: 'var(--body-sm-size)', color: 'var(--text-heading)' }}>
                Temps par question
              </span>
              {[0, 30, 45, 60].map((valeur) => (
                <Bouton
                  key={valeur}
                  taille="sm"
                  variante={duree === valeur ? 'primaire' : 'secondaire'}
                  onClick={() => setDuree(valeur)}
                >
                  {valeur === 0 ? 'Sans' : `${valeur} s`}
                </Bouton>
              ))}
            </span>
            <Bouton
              taille="lg"
              pleineLargeur
              iconeGauche={<Icone nom="presentation" taille={16} />}
              onClick={() => {
                void creerSession(
                  uid,
                  publiees.slice(0, 8).map((candidate) => candidate.id),
                  duree,
                ).then(setSessionId);
              }}
            >
              Ouvrir la séance
            </Bouton>
          </div>
        )}
      </div>
    );
  }

  /* --------------------------------------------------------- séance terminée */

  if (session.statut === 'terminee') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--surface-page)', padding: 'clamp(20px, 3.2vw, 36px)' }}>
        {classement ? (
          <RevelationClassement
            rangs={classement}
            monUid={uid}
            ecart={null}
            codeSession={session.code}
          />
        ) : (
          <EtatVide
            icone="award"
            titre="Séance terminée"
            texte="Le classement est en cours d’établissement."
          />
        )}
      </div>
    );
  }

  const total = session.questionIds.length;
  const dernier = session.indexCourant + 1 >= total;

  return (
    <div className="session-animateur">
      {/* ---------------------------------------------- écran projeté */}
      <div className="session-scene">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '8px 16px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.12)',
              color: '#fff',
              fontSize: 'clamp(16px, 1.6vw, 20px)',
              fontWeight: 700,
              letterSpacing: '0.14em',
            }}
          >
            {session.code}
          </span>
          <span style={{ fontSize: 'clamp(15px, 1.4vw, 19px)', color: SUR_ENCRE }}>
            Question {session.indexCourant + 1} sur {total}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
            <Chronometre
              ouverteLeMs={session.questionOuverteLeMs}
              dureeSecondes={session.revelee ? 0 : session.dureeQuestionSecondes}
              clair
            />
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.10)',
                fontSize: 'clamp(15px, 1.4vw, 19px)',
                color: '#fff',
              }}
            >
              <Icone nom="users" taille={17} />
              {reponsesCourantes.length} sur {participants.length || '—'}
            </span>
          </span>
        </div>

        {question ? (
          <>
            <div style={{ marginTop: 'clamp(20px, 3vw, 42px)' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(255,255,255,0.12)',
                  fontSize: 'clamp(11px, 1.1vw, 14px)',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.9)',
                }}
              >
                {LIBELLES_TYPE[question.type]}
              </span>
              <h1
                style={{
                  margin: 'clamp(14px, 1.6vw, 20px) 0 0',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 400,
                  /* Lisible du fond de la salle : c'est la contrainte qui
                     décide de la taille, pas l'échelle typographique. */
                  fontSize: 'clamp(26px, 3.6vw, 56px)',
                  lineHeight: 1.1,
                  color: '#fff',
                  textWrap: 'pretty',
                }}
              >
                {question.enonce}
              </h1>
            </div>

            <div className="session-options">
              {question.ordreOptions.map((identifiant, index) => {
                const compte = reponsesCourantes.filter((reponse) =>
                  reponse.optionsChoisies.includes(identifiant),
                ).length;
                const part =
                  reponsesCourantes.length === 0
                    ? 0
                    : Math.round((compte / reponsesCourantes.length) * 100);
                const juste = question.bonnesReponses.includes(identifiant);

                return (
                  <div
                    key={identifiant}
                    style={{
                      position: 'relative',
                      borderRadius: 'var(--radius-lg)',
                      background: 'rgba(255,255,255,0.07)',
                      border:
                        '1px solid ' +
                        (session.revelee && juste ? 'var(--status-success)' : 'rgba(255,255,255,0.16)'),
                      overflow: 'hidden',
                    }}
                  >
                    {/* La barre ne paraît qu'à la révélation : voir la
                        répartition monter pendant le vote dirait aux derniers
                        ce que les premiers ont voté. */}
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: session.revelee ? `${part}%` : 0,
                        background: juste ? 'rgba(45,161,49,0.34)' : 'rgba(255,255,255,0.10)',
                        transition: 'width var(--duration-slow) var(--ease-out)',
                      }}
                    />
                    <span
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-4)',
                        padding: 'clamp(12px, 1.4vw, 20px) clamp(14px, 1.6vw, 24px)',
                      }}
                    >
                      <span
                        style={{
                          width: 34,
                          height: 34,
                          flex: 'none',
                          borderRadius: 999,
                          background:
                            session.revelee && juste ? 'var(--status-success)' : 'rgba(255,255,255,0.16)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 'clamp(14px, 1.3vw, 17px)',
                          fontWeight: 700,
                        }}
                      >
                        {session.revelee && juste ? (
                          <Icone nom="check" taille={18} />
                        ) : (
                          String.fromCharCode(65 + index)
                        )}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 'clamp(16px, 1.7vw, 26px)',
                          lineHeight: 1.3,
                          color: '#fff',
                        }}
                      >
                        {question.options[identifiant]}
                      </span>
                      {session.revelee && (
                        <span
                          style={{
                            flex: 'none',
                            fontSize: 'clamp(15px, 1.5vw, 22px)',
                            fontWeight: 600,
                            color: juste ? '#fff' : 'rgba(255,255,255,0.7)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {part} %
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p style={{ marginTop: 40, color: SUR_ENCRE }}>
            Cette question n’est plus publiée. Passez à la suivante.
          </p>
        )}

        <div className="session-commandes">
          {session.revelee ? (
            <>
              <Bouton
                taille="lg"
                variante="soulignee"
                onClick={() => {
                  if (dernier) void terminerSession(session.id);
                  else void questionSuivante(session.id, session.indexCourant + 1);
                }}
              >
                {dernier ? 'Terminer et classer' : 'Question suivante'}
              </Bouton>
              <Bouton taille="lg" variante="inverse" onClick={() => void rejouerLeVote(session.id)}>
                Rejouer le vote
              </Bouton>
              <span style={{ marginLeft: 'auto', fontSize: 'var(--body-md-size)', color: SUR_ENCRE }}>
                Bonne réponse révélée
              </span>
            </>
          ) : (
            <>
              <Bouton taille="lg" variante="soulignee" onClick={() => void reveler()}>
                Révéler la bonne réponse
              </Bouton>
              <span style={{ marginLeft: 'auto', fontSize: 'var(--body-md-size)', color: SUR_ENCRE }}>
                {reponsesCourantes.length} réponse{reponsesCourantes.length > 1 ? 's' : ''} reçue
                {reponsesCourantes.length > 1 ? 's' : ''}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ------------------------------------------- panneau de l'animatrice */}
      <aside className="session-panneau">
        <span style={{ fontSize: 'var(--body-sm-size)', fontWeight: 600, color: 'var(--text-heading)' }}>
          Participants
        </span>
        <Meta style={{ fontSize: 12 }}>
          {reponsesCourantes.length} sur {participants.length} ont répondu
        </Meta>

        <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {participants.length === 0 && (
            <Meta style={{ fontSize: 12 }}>Personne n’a encore rejoint la séance.</Meta>
          )}
          {participants.map((participant) => {
            const sienne = reponsesCourantes.find((reponse) => reponse.uid === participant.uid);
            const lettre = sienne
              ? (question?.ordreOptions
                  .map((identifiant, index) =>
                    sienne.optionsChoisies.includes(identifiant)
                      ? String.fromCharCode(65 + index)
                      : null,
                  )
                  .filter(Boolean)
                  .join('') ?? '')
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
                >
                  {participant.nom}
                </span>
                <Meta style={{ fontSize: 12 }}>{sienne == null ? 'en attente' : lettre}</Meta>
              </span>
            );
          })}
        </div>

        {session.revelee && question && (
          <div style={{ marginTop: 'auto', paddingTop: 'var(--space-5)' }}>
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
    </div>
  );
}
