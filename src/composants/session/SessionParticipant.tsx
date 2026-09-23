'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Bouton, Carte, EtiquetteStatut, Meta } from '@/composants/ds/primitives';
import { EtatVide, Squelettes } from '@/composants/ds/etats';
import {
  ConsigneReponses,
  GroupeDeReponses,
  OptionReponse,
  Argumentaire,
  SignatureExplication,
  Verdict,
} from '@/composants/ds/parcours';
import { AccesSeance, type VerdictAcces } from '@/composants/session/AccesSeance';
import { Chronometre } from '@/composants/session/Chronometre';
import { RepartitionLue } from '@/composants/session/RepartitionLue';
import { RevelationClassement } from '@/composants/session/RevelationClassement';
import { authentification } from '@/lib/firebase/client';
import { libelleAttendu } from '@/lib/questions/modele';
import { corriger } from '@/lib/serie/verdict';
import { TITRE_PAUSE_PARTICIPANT } from '@/lib/session/seance';
import type { CleAvatar } from '@/lib/session/avatar';
import {
  chargerMaReponse,
  chercherSessionParCode,
  ecouterClassement,
  ecouterQuestion,
  ecouterSession,
  rejoindre,
  type LieuPresence,
  repondreEnSession,
  type Rang,
  type Session,
} from '@/lib/session/depot';
import type { Question } from '@/lib/questions/lecture';

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
 * - **Perdre la connexion.** L'écouteur le dit, et on l'annonce plutôt que
 *   d'afficher une question périmée en silence. Firestore reconnecte seul.
 *   **Le drapeau ne vaut pas `fromCache` brut** : le premier instantané vient
 *   toujours du cache, et l'annoncer faisait du bandeau « Connexion perdue »
 *   la première chose qu'un commercial voyait en entrant. Voir
 *   `ecouterSession`, qui porte la distinction.
 * - **Répondre trop tard.** Les règles refusent l'écriture après la
 *   révélation. Ce refus n'est pas une panne, et l'écran le dit.
 */

type EtatVote = 'ouvert' | 'envoi' | 'envoye' | 'trop-tard' | 'echec';

/** Rattache la consigne au groupe d'options pour les lecteurs d'écran. */
const CONSIGNE = 'consigne-reponses';

export function SessionParticipant() {
  const [uid, setUid] = useState<string | null>(null);

  /*
   * Le code apporté par l'adresse : `/session?code=XXXXXX`, où mène le QR de
   * la salle d'attente en passant par `/rejoindre`. Lu une fois, à l'arrivée :
   * il préremplit le formulaire, la suite appartient au participant.
   */
  const parametres = useSearchParams();
  const codeDeLAdresse = (parametres.get('code') ?? '').trim().toUpperCase() || undefined;
  const [nomPropose, setNomPropose] = useState('');

  /*
   * Le code, le nom et la couleur vivent désormais dans `AccesSeance`, qui est
   * le seul écran à s'en servir. Ce composant ne garde que ce qui survit à la
   * jonction : l'identité, et la séance une fois rejointe.
   */
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const [classement, setClassement] = useState<Rang[] | null>(null);

  const [choisies, setChoisies] = useState<string[]>([]);
  const [vote, setVote] = useState<EtatVote>('ouvert');

  useEffect(() => {
    return authentification().onAuthStateChanged((utilisateur) => {
      setUid(utilisateur?.uid ?? null);
      setNomPropose(utilisateur?.displayName?.split(' ')[0] ?? '');
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

  const questionId = session ? session.questionIds[session.indexCourant] : undefined;

  /*
   * **La question vient du direct, et de nulle part ailleurs.**
   *
   * Cet écran recevait tout le référentiel — la banque publiée entière — pour
   * n'y chercher qu'une question à la fois, en secours du direct. À quatorze
   * questions le gaspillage ne se voyait pas ; à cent cinquante il se compte
   * en dizaines de kilo-octets, à chaque chargement, sur le téléphone d'un
   * commercial en séance. L'écouteur répond en quelques dizaines de
   * millisecondes et fait autorité de toute façon : le secours coûtait plus
   * qu'il ne servait.
   *
   * **Trois états, et il faut les distinguer.** Tant que l'écouteur n'a pas
   * parlé, on attend — ce n'est pas une panne. Quand il rend `null`, la
   * question n'est plus publiée, et là il faut le dire. L'identifiant voyage
   * avec la valeur, ce qui suffit à reconnaître un instantané en retard.
   */
  const [vive, setVive] = useState<{ id: string; question: Question | null } | null>(null);

  useEffect(() => {
    if (!questionId) return;
    return ecouterQuestion(questionId, (recue) => setVive({ id: questionId, question: recue }));
  }, [questionId]);

  const recue = vive?.id === questionId;
  const question = recue ? (vive?.question ?? null) : null;

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

  /*
   * Retrouver sa propre réponse.
   *
   * Après un rechargement, une coupure, ou un vote rejoué par l'animatrice,
   * l'écran repartait vierge avec un bouton « Envoyer » actif — alors que les
   * règles refusent une seconde réponse à la même question. On lit donc la
   * sienne, qu'on a le droit de lire, et l'écran dit la vérité.
   */
  useEffect(() => {
    if (!uid || !sessionId || !questionId) return;
    let vivant = true;

    chargerMaReponse(sessionId, uid, questionId)
      .then((sienne) => {
        if (!vivant || sienne === null) return;
        setChoisies(sienne);
        setVote('envoye');
      })
      .catch((panne: unknown) => {
        /*
         * **Ne plus confondre « pas encore répondu » avec une panne.**
         *
         * Ce `catch` absorbait tout, et il absorbait surtout un refus de
         * permission que les règles renvoyaient sur chaque question sans
         * réponse : `resource` est nul sur un document absent. L'écran
         * marchait par accident, et une vraie panne s'y serait cachée
         * exactement pareil.
         *
         * Les règles se prononcent maintenant sur l'absence, qui remonte en
         * `null` par le chemin normal. Ce qui arrive ici est donc un défaut —
         * une lecture impossible, hors ligne le plus souvent. L'écran reste
         * ouvert et les règles trancheront à l'envoi, mais on le dit.
         */
        console.error('Lecture de la réponse déjà donnée impossible', panne);
      });

    return () => {
      vivant = false;
    };
  }, [uid, sessionId, questionId]);

  /**
   * Entrer dans la séance.
   *
   * **Trois issues, et elles ne se confondent pas.** « Aucune séance ouverte
   * avec ce code » n'est pas « l'accès est fermé », qui n'est pas « la
   * recherche n'a pas abouti » — la première fait relire le code, la deuxième
   * fait lever la main, la troisième fait attendre le réseau. Les fondre en un
   * booléen ferait chercher une faute de frappe à quelqu'un qui n'en a pas
   * faite.
   *
   * **La lecture donne le message, la règle donne le refus.** On lit la séance
   * avant d'écrire pour savoir quoi dire ; c'est la règle de création d'un
   * marqueur de présence qui interdit réellement d'entrer. Un onglet resté
   * ouvert sur l'ancien état ne passe donc pas.
   */
  const rejoindreParCode = useCallback(
    async (
      codeSaisi: string,
      nomChoisi: string,
      avatarChoisi: CleAvatar,
      presenceChoisie: LieuPresence,
    ): Promise<VerdictAcces> => {
      if (!uid) return { sorte: 'introuvable' };

      const trouvee = await chercherSessionParCode(codeSaisi.toUpperCase());
      if (!trouvee) return { sorte: 'introuvable' };

      /*
       * **On tente, puis on explique — et surtout pas l'inverse.**
       *
       * Refuser d'avance sur `verrouillee` paraissait économique : une lecture
       * qu'on a déjà, un aller-retour de moins. C'était faux, et le navigateur
       * l'a montré. Quelqu'un qui est *dans la salle* et qui recharge son
       * onglet repasse par cet écran — `sessionId` ne vit que dans l'état React
       * — et se voyait alors refuser l'entrée de la pièce où il se trouvait. La
       * règle, elle, l'aurait laissé passer : verrouiller ne ferme que la
       * *création* d'un marqueur, et le sien existe.
       *
       * La règle est donc seule juge. L'écran ne parle qu'après elle.
       */
      try {
        await rejoindre(trouvee.id, uid, nomChoisi, avatarChoisi, presenceChoisie);
      } catch (probleme) {
        /*
         * On relit avant de nommer le refus : la porte a pu se fermer entre
         * la lecture et l'écriture, ou la séance se terminer. Tout refus que
         * la relecture n'explique pas remonte — un `catch` ne doit absorber
         * que les causes qu'il sait nommer.
         */
        if ((probleme as { code?: string })?.code !== 'permission-denied') throw probleme;
        const relue = await chercherSessionParCode(codeSaisi.toUpperCase());
        if (!relue) return { sorte: 'introuvable' };
        /* La séance voyage avec le refus : c'est à *celle-là* qu'on frappera,
           et ce n'est pas forcément celle annoncée sur l'écran d'accès. */
        if (relue.verrouillee) return { sorte: 'fermee', seance: relue };
        throw probleme;
      }

      setSessionId(trouvee.id);
      return { sorte: 'entre' };
    },
    [uid],
  );

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

  /*
   * L'écran d'accès — 10a et 10b au bureau, 06 et 06b en mobile.
   *
   * Il a remplacé le formulaire nu qui vivait ici. Ce qu'il ajoute n'est pas
   * décoratif : il annonce ce que la séance va couvrir, combien de temps elle
   * prendra, et qui est déjà dans la salle. On n'entre plus à l'aveugle dans
   * une pièce dont on ne sait rien.
   */
  if (!sessionId) {
    return (
      <div className="page-admin">
        <AccesSeance
          uid={uid}
          nomPropose={nomPropose}
          codeInitial={codeDeLAdresse}
          onRejoindre={rejoindreParCode}
        />
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

  /*
   * Une séance suspendue le dit.
   *
   * Laisser la question à l'écran pendant que le vote est fermé serait le pire
   * des états : dix personnes qui appuient sur « Envoyer » et se font refuser
   * sans comprendre. L'écran change, et il annonce que ça reprendra.
   */
  /*
   * **Rejoint, mais la séance n'a pas commencé.**
   *
   * Entre l'ouverture de la salle et la première question, l'animatrice dicte
   * le code et attend les retardataires — c'est la salle d'attente, côté
   * projection. Le participant, lui, n'a rien à faire : sans cet écran il
   * verrait la question 1 avant qu'elle soit posée, et pourrait y répondre
   * pendant que Noémie parle encore.
   *
   * L'écran reste ouvert et la question arrivera toute seule : c'est le même
   * contrat que la pause, poussé par le même écouteur.
   */
  if (!session.demarree) {
    return (
      <div className="page-admin">
        <EtatVide
          icone="users"
          titre="Vous êtes dans la salle"
          texte="La première question arrivera sur cet écran dès que l’animatrice la posera. Gardez-le ouvert."
        />
      </div>
    );
  }

  if (session.statut === 'pause') {
    return (
      <div className="page-admin">
        <EtatVide
          icone="clock"
          titre={TITRE_PAUSE_PARTICIPANT}
          texte="L’animatrice a suspendu la séance. Gardez cet écran ouvert : la question suivante s’affichera ici."
        />
      </div>
    );
  }

  if (session.statut === 'abandonnee') {
    return (
      <div className="page-admin">
        <EtatVide
          icone="alert"
          titre="Séance interrompue"
          texte="La séance s’est arrêtée avant la fin : il n’y a pas de classement. Vos réponses comptent quand même dans votre progression et dans vos questions à revoir."
        />
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

  // L'écouteur n'a pas encore parlé : c'est un chargement, pas un incident.
  if (!recue) {
    return (
      <div className="page-admin">
        <Squelettes lignes={4} />
      </div>
    );
  }

  const total = session.questionIds.length;

  /*
   * **La question a été retirée de la banque — et on reste en séance.**
   *
   * C'était un encadré d'erreur seul au milieu de la page, dans la coquille du
   * parcours. Sur un téléphone, au milieu d'une séance, il ne ressemblait à
   * aucun des écrans qui l'entouraient : le commercial croyait en être sorti,
   * alors qu'il y était toujours et que la suite allait arriver sur cet écran.
   *
   * **Même forme qu'une question, donc** — l'étiquette d'état, le rang dans la
   * séance, la colonne centrée de 760 px — et seul le contenu change : le
   * message prend la place de l'énoncé et des options.
   *
   * **Sans chronomètre.** Le décompte dit combien de temps il reste pour
   * répondre ; il n'y a rien à répondre. Le faire tourner ici serait le seul
   * élément de l'écran à mentir.
   */
  if (!question) {
    return (
      <div className="page-admin">
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}
        >
          <EtiquetteStatut ton="attention">Retirée</EtiquetteStatut>
          <Meta>
            Question {session.indexCourant + 1} sur {total}
          </Meta>
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
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: 'clamp(24px, 5vw, 36px)',
              lineHeight: 1.14,
              color: 'var(--text-heading)',
              textWrap: 'pretty',
            }}
          >
            Cette question a été retirée
          </h1>

          <p
            style={{
              margin: '16px 0 0',
              fontSize: 'var(--body-md-size)',
              lineHeight: 1.6,
              color: 'var(--neutral-70)',
              textWrap: 'pretty',
            }}
          >
            Elle ne fait plus partie de la banque : il n’y a rien à répondre, et elle ne compte
            pas pour vous. Vous êtes toujours dans la séance — restez sur cet écran, l’animatrice
            passe à la suivante et elle s’affichera ici.
          </p>
        </div>
      </div>
    );
  }

  const correction = session.revelee ? corriger(question, choisies) : null;
  const multiple = question.bonnesReponses.length > 1;
  const verrouille = vote !== 'ouvert' || session.revelee;

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
        <EtiquetteStatut ton="brouillon">{libelleAttendu(question)}</EtiquetteStatut>
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

        {/*
         * La règle la plus contre-intuitive de l'outil, dite avant le vote.
         * Sans elle, la seule différence entre « une réponse » et « plusieurs »
         * était la forme du marqueur — invisible pour qui ne connaît pas la
         * convention, inexistante pour un lecteur d'écran. Ajout hors maquette,
         * documenté dans `docs/design-imports.md`.
         */}
        <ConsigneReponses id={CONSIGNE} multiple={multiple} />

        <GroupeDeReponses
          decritPar={CONSIGNE}
          style={{
            marginTop: 'var(--space-5)',
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
        </GroupeDeReponses>

        {session.revelee ? (
          <div style={{ marginTop: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <RepartitionLue
              repartition={session.repartition}
              repondants={session.repondants}
              question={question}
            />
            <Verdict
              ton={correction?.correcte ? 'ok' : 'ko'}
              titre={choisies.length === 0 ? 'Vous n’avez pas répondu' : (correction?.titre ?? '')}
            >
              {question.explication}
            </Verdict>

            {/* Le même angle de vente qu'à l'entraînement : ce qui se dit au
                téléphone ne change pas parce qu'on est un jeudi. */}
            {question.argumentaire.trim().length > 0 && (
              <Argumentaire>{question.argumentaire}</Argumentaire>
            )}

            <SignatureExplication
              auteur={question.explicationAuteur}
              majLe={question.explicationMajLe}
            />
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
            {/*
             * Ce que voit quelqu'un qui a déjà répondu quand le vote rouvre.
             *
             * L'animatrice peut rouvrir une question : ceux qui n'avaient pas
             * répondu retrouvent le vote, les autres non — une réponse par
             * personne, garantie par les règles. Sans cette phrase, celui qui a
             * déjà répondu voit un vote rouvert et un bouton éteint, et ne sait
             * pas si c'est lui ou l'outil qui ne va pas.
             */}
            <span style={{ flex: 1, minWidth: 200, fontSize: 'var(--body-sm-size)', color: 'var(--neutral-70)' }}>
              {session.repondants} réponse{session.repondants > 1 ? 's' : ''} reçue
              {session.repondants > 1 ? 's' : ''}.{' '}
              {vote === 'envoye'
                ? 'Votre réponse ne se change plus, même si le vote rouvre. La correction s’affiche dès que l’animatrice révèle la bonne réponse.'
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
              compte pas pour vous - la suivante, si.
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

/** Reprise locale de `ecartAuPodium` : le navigateur n'importe pas `functions/`. */
function ecartPourMoi(rangs: Rang[], uid: string): number | null {
  const moi = rangs.find((rang) => rang.uid === uid);
  if (!moi || moi.distinction !== null) return null;

  const dernierDuPodium = rangs.filter((rang) => rang.distinction !== null).at(-1);
  if (!dernierDuPodium) return null;

  const manque = dernierDuPodium.justes - moi.justes;
  return manque > 0 ? manque : null;
}
