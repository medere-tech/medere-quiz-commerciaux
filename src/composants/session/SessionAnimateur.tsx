'use client';

import type { Route } from 'next';

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
  ecouterClassement,
  ecouterParticipants,
  ecouterReponses,
  ecouterSession,
  abandonner,
  maSessionEnCours,
  mettreEnPause,
  questionSuivante,
  reprendre,
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

  /* ------------------------------------------------------- rien à animer */

  if (!sessionId || !session) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--surface-page)',
          padding: 'clamp(20px, 3.2vw, 36px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/*
         * L'écran d'animation n'invente plus de séance.
         *
         * Il prenait les huit premières questions publiées : un dépannage tant
         * que la composition n'existait pas. La séance porte sur ce que Noémie
         * vient de présenter, et elle la choisit — ici, on anime ce qui a été
         * préparé, rien d'autre.
         */}
        <EtatVide
          icone="presentation"
          titre="Aucune séance ouverte"
          texte="Préparez une séance depuis le back-office, puis lancez-la d’ici."
          actions={
            <Bouton href={'/admin/session' as Route} iconeGauche={<Icone nom="layers" taille={15} />}>
              Composer une séance
            </Bouton>
          }
        />
      </div>
    );
  }

  if (session.statut === 'abandonnee') {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--surface-page)',
          padding: 'clamp(20px, 3.2vw, 36px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <EtatVide
          icone="alert"
          titre="Séance interrompue"
          texte="Aucun classement n’a été établi. Les réponses déjà données restent dans la progression de chacun."
          actions={
            <Bouton variante="secondaire" href={'/admin/session' as Route}>
              Préparer une nouvelle séance
            </Bouton>
          }
        />
      </div>
    );
  }

  if (session.statut === 'terminee') {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--surface-page)',
          padding: 'clamp(20px, 3.2vw, 36px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
        }}
      >
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

        {/*
         * Une sortie.
         *
         * Cet écran vit hors de la coquille — il est projeté, une barre
         * latérale y prendrait la place de la question. Mais une fois la séance
         * close, il n'y avait plus aucun chemin depuis cette page : l'animatrice
         * restait devant son classement sans rien pour en partir.
         */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Bouton variante="secondaire" href={'/admin/statistiques' as Route}>
            Revenir au back-office
          </Bouton>
        </div>
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
          enPause: session.statut === 'pause',
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
        onPause={() => void mettreEnPause(session.id)}
        onReprendre={() => void reprendre(session.id)}
        onTerminer={() => void terminerSession(session.id)}
        onAbandonner={() => void abandonner(session.id)}
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
