'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Bouton, Carte, Champ, EtiquetteStatut, Meta } from '@/composants/ds/primitives';
import { EtatErreur, EtatVide, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { OptionReponse, Verdict } from '@/composants/ds/parcours';
import { Chronometre } from '@/composants/session/Chronometre';
import { RevelationClassement } from '@/composants/session/RevelationClassement';
import type { Referentiel } from '@/composants/parcours/donnees';
import { authentification } from '@/lib/firebase/client';
import { LIBELLES_TYPE } from '@/lib/questions/modele';
import { corriger } from '@/lib/serie/verdict';
import {
  chercherSessionParCode,
  ecouterClassement,
  ecouterSession,
  NOM_SESSION_MAX,
  rejoindre,
  repondreEnSession,
  type Rang,
  type Session,
} from '@/lib/session/depot';

/**
 * 10a · Session collective, côté commercial.
 *
 * **La question arrive par le réseau, jamais par l'écran partagé.** Une partie
 * de la salle est en visioconférence et voit la projection avec plusieurs
 * secondes de retard : tout ce qui compte — la question, le compte à rebours,
 * la révélation — est poussé sur cet appareil par un écouteur temps réel.
 *
 * Trois situations sont traitées explicitement, parce qu'elles arrivent :
 *
 * - **Arriver en retard.** L'écouteur donne l'état courant, sans rattrapage :
 *   les questions passées ne concernent plus personne. Si la réponse est déjà
 *   révélée, la correction s'affiche et le vote est fermé — répondre juste ne
 *   prouverait rien, et la réponse compterait dans la progression.
 * - **Perdre la connexion.** `fromCache` dit que l'instantané ne vient pas du
 *   serveur : on l'annonce plutôt que d'afficher une question périmée en
 *   silence. Firestore reconnecte seul.
 * - **Répondre trop tard.** Les règles refusent l'écriture après la
 *   révélation. Ce refus n'est pas une panne, et l'écran le dit.
 */

type EtatVote = 'ouvert' | 'envoi' | 'envoye' | 'trop-tard' | 'echec';

const CLE_CODE = 'code';

export function SessionParticipant({ referentiel }: { referentiel: Referentiel }) {
  const [uid, setUid] = useState<string | null>(null);
  const [nomPropose, setNomPropose] = useState('');

  const [code, setCode] = useState('');
  const [nom, setNom] = useState('');
  const [recherche, setRecherche] = useState<'repos' | 'encours' | 'introuvable' | 'echec'>('repos');

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const [classement, setClassement] = useState<Rang[] | null>(null);

  const [choisies, setChoisies] = useState<string[]>([]);
  const [vote, setVote] = useState<EtatVote>('ouvert');

  useEffect(() => {
    return authentification().onAuthStateChanged((utilisateur) => {
      setUid(utilisateur?.uid ?? null);
      const propose = utilisateur?.displayName?.split(' ')[0] ?? '';
      setNomPropose(propose);
      setNom((actuel) => (actuel === '' ? propose : actuel));
    });
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    return ecouterSession(sessionId, (etat, cache) => {
      setSession(etat);
      setHorsLigne(cache);
    });
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || session?.statut !== 'terminee') return;
    return ecouterClassement(sessionId, setClassement);
  }, [sessionId, session?.statut]);

  const question = useMemo(() => {
    if (!session) return null;
    const identifiant = session.questionIds[session.indexCourant];
    return referentiel.questions.find((candidate) => candidate.id === identifiant) ?? null;
  }, [session, referentiel.questions]);

  /*
   * Changer de question remet le vote à zéro : c'est une nouvelle manche.
   *
   * L'ajustement se fait pendant le rendu, pas dans un effet. React documente
   * ce motif pour exactement ce cas — un état dérivé d'une valeur qui vient de
   * l'extérieur — et il évite le rendu intermédiaire pendant lequel l'écran
   * afficherait la nouvelle question avec l'ancienne sélection.
   */
  const [questionVue, setQuestionVue] = useState(-1);
  if (session && session.indexCourant !== questionVue) {
    setQuestionVue(session.indexCourant);
    setChoisies([]);
    setVote('ouvert');
  }

  const rejoindreParCode = useCallback(async () => {
    if (!uid || code.trim() === '' || nom.trim() === '') return;
    setRecherche('encours');
    try {
      const trouvee = await chercherSessionParCode(code.toUpperCase());
      if (!trouvee) {
        setRecherche('introuvable');
        return;
      }
      await rejoindre(trouvee.id, uid, nom);
      setSessionId(trouvee.id);
      setRecherche('repos');
    } catch {
      setRecherche('echec');
    }
  }, [uid, code, nom]);

  const envoyer = useCallback(async () => {
    if (!uid || !session || !question || choisies.length === 0) return;
    setVote('envoi');
    try {
      await repondreEnSession(
        session.id,
        uid,
        question.id,
        choisies,
        corriger(question, choisies).correcte,
      );
      setVote('envoye');
    } catch (probleme) {
      // Les règles refusent après la révélation : ce n'est pas une panne.
      const code = (probleme as { code?: string })?.code;
      setVote(code === 'permission-denied' ? 'trop-tard' : 'echec');
    }
  }, [uid, session, question, choisies]);

  if (!uid) {
    return (
      <div className="page-admin">
        <Squelettes lignes={3} />
      </div>
    );
  }

  /* ------------------------------------------------------ rejoindre */

  if (!sessionId) {
    return (
      <div className="page-admin">
        <div style={{ maxWidth: 460, width: '100%', margin: '0 auto' }}>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontWeight: 300,
              fontSize: 'clamp(24px, 5vw, 30px)',
              lineHeight: 1.18,
              color: 'var(--text-heading)',
            }}
          >
            Rejoindre la{' '}
            <em style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400 }}>
              session du jeudi
            </em>
          </h1>
          <p
            style={{
              margin: '12px 0 24px',
              fontSize: 'var(--body-md-size)',
              lineHeight: 1.55,
              color: 'var(--neutral-70)',
            }}
          >
            Le code est annoncé à voix haute au début de la séance.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Champ
              label="Code de la séance"
              value={code}
              onChange={(valeur) => setCode(valeur.toUpperCase())}
              placeholder="JEUDI7"
              autoComplete="off"
              name={CLE_CODE}
              style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}
            />
            {/*
             * Le nom se règle ici, au moment de rejoindre, et pas dans un
             * réglage : un écran de préférences qu'il faut penser à ouvrir
             * avant le jeudi ne serait jamais ouvert. Il est prérempli avec le
             * choix de la dernière fois, ou le prénom du compte.
             */}
            <Champ
              label="Votre nom au classement"
              value={nom}
              onChange={(valeur) => setNom(valeur.slice(0, NOM_SESSION_MAX))}
              aide={`Visible par toute la salle, sur l’écran projeté. ${NOM_SESSION_MAX} caractères au plus.`}
              placeholder={nomPropose || 'Votre prénom'}
              autoComplete="off"
            />
            <Bouton
              taille="lg"
              pleineLargeur
              disabled={recherche === 'encours' || code.trim() === '' || nom.trim() === ''}
              iconeGauche={<Icone nom="users" taille={16} />}
              onClick={() => void rejoindreParCode()}
            >
              {recherche === 'encours' ? 'Recherche…' : 'Rejoindre'}
            </Bouton>

            {recherche === 'introuvable' && (
              <Carte rayon="var(--radius-md)" rembourrage="14px 16px" elevation="petite">
                <span style={{ fontSize: 'var(--body-sm-size)', color: 'var(--text-heading)' }}>
                  Aucune séance ouverte sous ce code. Vérifiez-le auprès de l’animatrice — une
                  séance terminée ne se rejoint plus.
                </span>
              </Carte>
            )}
            {recherche === 'echec' && (
              <Carte rayon="var(--radius-md)" rembourrage="14px 16px" elevation="petite">
                <span style={{ fontSize: 'var(--body-sm-size)', color: 'var(--status-danger-texte)' }}>
                  La recherche n’a pas abouti. Réessayez dans un instant.
                </span>
              </Carte>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------- en séance */

  if (!session) {
    return (
      <div className="page-admin">
        <Squelettes lignes={3} />
      </div>
    );
  }

  if (session.statut === 'terminee') {
    return (
      <div className="page-admin">
        {classement ? (
          <RevelationClassement
            rangs={classement}
            monUid={uid}
            ecart={ecartPourMoi(classement, uid)}
            codeSession={session.code}
          />
        ) : (
          <EtatVide
            icone="award"
            titre="Séance terminée"
            texte="Le classement s’affiche dès qu’il est établi."
          />
        )}
      </div>
    );
  }

  if (!question) {
    return (
      <div className="page-admin">
        <EtatErreur
          titre="Question indisponible"
          texte="Cette question n’est plus publiée. L’animatrice peut passer à la suivante."
        />
      </div>
    );
  }

  const correction = session.revelee ? corriger(question, choisies) : null;
  const multiple = question.bonnesReponses.length > 1;
  const verrouille = vote !== 'ouvert' || session.revelee;
  const total = session.questionIds.length;

  return (
    <div className="page-admin">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <EtiquetteStatut ton={session.revelee ? 'attention' : 'publiee'}>
          {session.revelee ? 'Correction' : 'En direct'}
        </EtiquetteStatut>
        <Meta>
          Question {session.indexCourant + 1} sur {total}
        </Meta>
        <span style={{ marginLeft: 'auto' }}>
          <Chronometre
            ouverteLeMs={session.questionOuverteLeMs}
            dureeSecondes={session.revelee ? 0 : session.dureeQuestionSecondes}
          />
        </span>
      </div>

      {horsLigne && (
        <Carte rayon="var(--radius-md)" rembourrage="12px 16px" elevation="petite">
          <span style={{ fontSize: 'var(--body-sm-size)', color: 'var(--text-heading)' }}>
            Connexion perdue. Cet écran montre le dernier état reçu ; il se remettra à jour tout
            seul.
          </span>
        </Carte>
      )}

      <div style={{ maxWidth: 760, width: '100%', margin: '0 auto' }}>
        <EtiquetteStatut ton="brouillon">{LIBELLES_TYPE[question.type]}</EtiquetteStatut>
        {question.contexte && (
          <p
            style={{
              margin: '14px 0 0',
              fontSize: 'var(--body-md-size)',
              lineHeight: 1.6,
              color: 'var(--neutral-70)',
              textWrap: 'pretty',
            }}
          >
            {question.contexte}
          </p>
        )}
        <h1
          style={{
            margin: '16px 0 0',
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(24px, 5vw, 36px)',
            lineHeight: 1.14,
            color: 'var(--text-heading)',
            textWrap: 'pretty',
          }}
        >
          {question.enonce}
        </h1>

        <div
          style={{
            marginTop: 'var(--space-6)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {question.ordreOptions.map((identifiant, index) => (
            <OptionReponse
              key={identifiant}
              marqueur={String.fromCharCode(65 + index)}
              multiple={multiple}
              etat={
                correction
                  ? correction.etats[identifiant]
                  : choisies.includes(identifiant)
                    ? 'selectionnee'
                    : 'repos'
              }
              onClick={
                verrouille
                  ? undefined
                  : () =>
                      setChoisies((actuelles) =>
                        multiple
                          ? actuelles.includes(identifiant)
                            ? actuelles.filter((autre) => autre !== identifiant)
                            : [...actuelles, identifiant]
                          : [identifiant],
                      )
              }
            >
              {question.options[identifiant]}
            </OptionReponse>
          ))}
        </div>

        {session.revelee ? (
          <div style={{ marginTop: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <RepartitionLue session={session} question={question} />
            <Verdict
              ton={correction?.correcte ? 'ok' : 'ko'}
              titre={choisies.length === 0 ? 'Vous n’avez pas répondu' : (correction?.titre ?? '')}
            >
              {question.explication}
            </Verdict>
          </div>
        ) : (
          <Carte
            rayon="var(--radius-lg)"
            rembourrage="16px 20px"
            elevation="petite"
            style={{
              marginTop: 'var(--space-5)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
              flexWrap: 'wrap',
            }}
          >
            <PastillesReponses recus={session.repondants} />
            <span style={{ flex: 1, minWidth: 200, fontSize: 'var(--body-sm-size)', color: 'var(--neutral-70)' }}>
              {session.repondants} réponse{session.repondants > 1 ? 's' : ''} reçue
              {session.repondants > 1 ? 's' : ''}.{' '}
              {vote === 'envoye'
                ? 'La correction s’affiche dès que l’animatrice révèle la bonne réponse.'
                : 'Choisissez, puis envoyez.'}
            </span>
            <Bouton
              disabled={verrouille || choisies.length === 0}
              onClick={() => void envoyer()}
              style={{ whiteSpace: 'nowrap' }}
            >
              {vote === 'envoye' ? 'Réponse envoyée' : vote === 'envoi' ? 'Envoi…' : 'Envoyer'}
            </Bouton>
          </Carte>
        )}

        {vote === 'trop-tard' && (
          <Carte rayon="var(--radius-md)" rembourrage="14px 16px" elevation="petite" style={{ marginTop: 'var(--space-4)' }}>
            <span style={{ fontSize: 'var(--body-sm-size)', color: 'var(--text-heading)' }}>
              La bonne réponse a été révélée avant que votre envoi n’arrive. Cette question ne
              compte pas pour vous — la suivante, si.
            </span>
          </Carte>
        )}
        {vote === 'echec' && (
          <Carte rayon="var(--radius-md)" rembourrage="14px 16px" elevation="petite" style={{ marginTop: 'var(--space-4)' }}>
            <span style={{ fontSize: 'var(--body-sm-size)', color: 'var(--status-danger-texte)' }}>
              Votre réponse n’est pas partie. Réessayez : elle n’a pas été enregistrée.
            </span>
          </Carte>
        )}
      </div>
    </div>
  );
}

/** Une pastille par réponse reçue. Le nombre monte, on le voit monter. */
function PastillesReponses({ recus }: { recus: number }) {
  const pastilles = Math.min(recus, 12);
  return (
    <span aria-hidden="true" style={{ display: 'flex', gap: 4, flex: 'none' }}>
      {Array.from({ length: Math.max(pastilles, 1) }).map((_, index) => (
        <span
          key={index}
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: index < recus ? 'var(--status-info)' : 'var(--neutral-30)',
            transition: 'background var(--duration-base) var(--ease-standard)',
          }}
        />
      ))}
    </span>
  );
}

/**
 * La répartition, telle qu'elle a été publiée par l'animatrice.
 *
 * Elle n'est pas recalculée ici : un participant ne lit pas les réponses des
 * autres, et c'est exactement ce qu'on veut. Le tableau qu'il voit est celui
 * que la révélation a figé.
 */
function RepartitionLue({
  session,
  question,
}: {
  session: Session;
  question: { ordreOptions: string[]; options: Record<string, string>; bonnesReponses: string[] };
}) {
  const total = session.repartition.reduce((somme, valeur) => somme + valeur, 0);
  if (total === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {question.ordreOptions.map((identifiant, index) => {
        const compte = session.repartition[index] ?? 0;
        const part = Math.round((compte / total) * 100);
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
        {total} réponse{total > 1 ? 's' : ''} au total.
      </Meta>
    </div>
  );
}

/** Reprise locale de `ecartAuPodium` : le navigateur n'importe pas `functions/`. */
function ecartPourMoi(rangs: Rang[], uid: string): number | null {
  const moi = rangs.find((rang) => rang.uid === uid);
  if (!moi || moi.distinction !== null) return null;

  const dernierDuPodium = rangs.filter((rang) => rang.distinction !== null).at(-1);
  if (!dernierDuPodium) return null;

  const manque = dernierDuPodium.justes - moi.justes;
  return manque > 0 ? manque : null;
}
