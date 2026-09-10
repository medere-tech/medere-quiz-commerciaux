'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Bouton } from '@/composants/ds/primitives';
import { EtatVide, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { PanneauAnimatrice } from '@/composants/session/PanneauAnimatrice';
import { RevelationClassement } from '@/composants/session/RevelationClassement';
import { SceneProjetee } from '@/composants/session/SceneProjetee';
import type { Referentiel } from '@/composants/parcours/donnees';
import { authentification } from '@/lib/firebase/client';
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
  const comptes = (question?.ordreOptions ?? []).map(
    (identifiant) =>
      reponsesCourantes.filter((reponse) => reponse.optionsChoisies.includes(identifiant)).length,
  );

  return (
    <div className="session-animateur">
      <SceneProjetee
        vue={{
          code: session.code,
          numero: session.indexCourant + 1,
          total,
          question,
          revelee: session.revelee,
          comptes,
          reponsesRecues: reponsesCourantes.length,
          participants: participants.length,
          questionOuverteLeMs: session.questionOuverteLeMs,
          dureeQuestionSecondes: session.dureeQuestionSecondes,
        }}
        dernier={dernier}
        onReveler={() => void reveler()}
        onSuivante={() => {
          if (dernier) void terminerSession(session.id);
          else void questionSuivante(session.id, session.indexCourant + 1);
        }}
        onRejouer={() => void rejouerLeVote(session.id)}
      />

      <PanneauAnimatrice
        participants={participants}
        reponses={reponsesCourantes}
        question={question}
        revelee={session.revelee}
      />
    </div>
  );
}
