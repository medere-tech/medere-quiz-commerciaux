'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';

import { usePrechargementCertain } from '@/lib/navigation/intention';

import { Bouton, Carte, EtiquetteStatut, Meta, Touche, TitreSection } from '@/composants/ds/primitives';
import { EtatErreur, EtatVide, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { Jauge, OptionReponse, ProgressionSerie, Verdict } from '@/composants/ds/parcours';
import { useDonneesParcours, type Referentiel } from '@/composants/parcours/donnees';
import type { Question } from '@/lib/questions/depot';
import { LIBELLES_TYPE } from '@/lib/questions/modele';
import { crediterSerie, enregistrerReponse } from '@/lib/serie/depot';
import {
  LIBELLE_PONDERATION,
  TAILLE_SERIE,
  generateurAleatoire,
  graineNeuve,
  tirerRattrapage,
  tirerSerie,
} from '@/lib/serie/tirage';
import {
  corriger,
  etoilesGagnees,
  libelleSeuilsEtoiles,
  type Correction,
} from '@/lib/serie/verdict';

/**
 * 02, 03 et 04 · La série, de la première question au décompte final.
 *
 * **Un seul écran pour trois moments.** Question, correction, fin de série
 * partagent la même coquille : une barre d'avancement en haut, le contenu au
 * centre, les actions en bas. Le commercial ne change jamais de contexte au
 * milieu d'une série — c'est ce qui permet d'en enchaîner dix en six minutes.
 *
 * **Le moment signature est la correction.** Elle se répétera cent fois par
 * semaine. Trois exigences y sont tenues : le verdict nomme l'écart plutôt
 * que de dire « faux », chaque option porte son état — trouvée, manquée, en
 * trop —, et l'explication s'affiche **y compris quand la réponse est juste**,
 * parce que c'est là que le commercial apprend l'argument, pas seulement le
 * résultat.
 *
 * **Rien n'est perdu si l'on part.** Chaque réponse est écrite dès sa
 * validation. Quitter en cours de route ne rapporte aucune étoile — mais les
 * réponses déjà données restent, et pèsent sur les tirages suivants.
 */

const ROUTE_ACCUEIL: Route = '/';

type Etape = 'question' | 'correction' | 'fin';

type Passage = {
  question: Question;
  choisies: string[];
  correction: Correction;
};

export function Serie({ referentiel }: { referentiel: Referentiel }) {
  const routeur = useRouter();
  // D'une serie, on revient toujours a l'accueil : autant le charger pendant
  // que le commercial repond, quand le reseau ne fait rien.
  usePrechargementCertain(ROUTE_ACCUEIL);
  const requete = useSearchParams();
  const rattrapage = requete.get('mode') === 'rattrapage';

  const chargement = useDonneesParcours(referentiel);

  // Tirée une fois, conservée : c'est elle qui rend la série reproductible.
  const [graine, setGraine] = useState(graineNeuve);
  const [confirmerQuitter, setConfirmerQuitter] = useState(false);
  const [position, setPosition] = useState(0);
  const [etape, setEtape] = useState<Etape>('question');
  const [choisies, setChoisies] = useState<string[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreurEcriture, setErreurEcriture] = useState<string>();
  const creditee = useRef(false);

  const parIdentifiant = useMemo(() => {
    if (chargement.etat !== 'pret') return new Map<string, Question>();
    return new Map(chargement.donnees.questions.map((question) => [question.id, question]));
  }, [chargement]);

  /**
   * Le tirage se dérive de la graine, il ne se garde pas dans un état.
   *
   * Le rendre déterministe résout le seul vrai risque : un recalcul du mémo
   * rebattrait les questions au milieu de la série. À graine constante, le
   * même tirage ressort — recalculer devient sans conséquence.
   */
  const ordre = useMemo(() => {
    if (chargement.etat !== 'pret') return null;
    const hasard = generateurAleatoire(graine);
    const etats = chargement.donnees.etats;
    return rattrapage
      ? tirerRattrapage(etats, TAILLE_SERIE, hasard)
      : tirerSerie(etats, TAILLE_SERIE, hasard);
  }, [chargement, graine, rattrapage]);

  /** Repartir pour une série : tout est remis à zéro, y compris le crédit. */
  const recommencer = useCallback(
    (mode: 'ordinaire' | 'rattrapage') => {
      creditee.current = false;
      setPosition(0);
      setChoisies([]);
      setPassages([]);
      setEtape('question');
      setErreurEcriture(undefined);
      setGraine(graineNeuve());
      routeur.replace(
        (mode === 'rattrapage' ? '/serie?mode=rattrapage' : '/serie') as Route,
        { scroll: true },
      );
    },
    [routeur],
  );

  const question = ordre ? parIdentifiant.get(ordre[position] ?? '') : undefined;
  const resultats = useMemo(
    () =>
      Object.fromEntries(
        passages.map((passage, index) => [index, passage.correction.correcte ? 'ok' : 'ko']),
      ) as Record<number, 'ok' | 'ko'>,
    [passages],
  );

  const basculer = useCallback(
    (identifiant: string) => {
      if (etape !== 'question' || !question) return;
      setChoisies((precedentes) => {
        if (question.type === 'vf' || question.bonnesReponses.length === 1) {
          // Une seule réponse attendue : le choix se remplace, il ne s'ajoute
          // pas. Cocher deux cases pour une question qui n'en attend qu'une
          // ne peut produire qu'une erreur inutile.
          return precedentes.includes(identifiant) ? [] : [identifiant];
        }
        return precedentes.includes(identifiant)
          ? precedentes.filter((autre) => autre !== identifiant)
          : [...precedentes, identifiant];
      });
    },
    [etape, question],
  );

  const valider = useCallback(async () => {
    if (etape !== 'question' || !question || choisies.length === 0 || enregistrement) return;
    if (chargement.etat !== 'pret') return;

    const correction = corriger(question, choisies);
    setEnregistrement(true);
    setErreurEcriture(undefined);

    try {
      await enregistrerReponse(chargement.donnees.uid, question.id, choisies, correction.correcte);
    } catch {
      // La correction s'affiche quand même : refuser d'avancer parce qu'une
      // écriture a échoué punirait le commercial d'une panne de réseau.
      setErreurEcriture(
        'Cette réponse n’a pas pu être enregistrée. Elle ne comptera pas dans vos statistiques.',
      );
    } finally {
      setEnregistrement(false);
    }

    setPassages((precedents) => [...precedents, { question, choisies, correction }]);
    setEtape('correction');
  }, [chargement, choisies, enregistrement, etape, question]);

  const suivante = useCallback(async () => {
    if (etape !== 'correction' || !ordre) return;

    if (position + 1 >= ordre.length) {
      setEtape('fin');

      // Le crédit n'a lieu qu'ici, une seule fois : c'est la fin de série qui
      // rapporte, pas la dernière réponse.
      if (!creditee.current && chargement.etat === 'pret') {
        creditee.current = true;
        const justes = [...passages].filter((passage) => passage.correction.correcte).length;
        const etoiles = etoilesGagnees(justes, ordre.length);
        try {
          await crediterSerie(chargement.donnees.uid, etoiles);
        } catch {
          setErreurEcriture('Vos étoiles n’ont pas pu être enregistrées. Vos réponses, si.');
        }
      }
      return;
    }

    setPosition((precedente) => precedente + 1);
    setChoisies([]);
    setEtape('question');
  }, [chargement, etape, ordre, passages, position]);

  /**
   * Clavier : chiffres pour cocher, V et F pour un vrai ou faux, Entrée pour
   * valider puis pour continuer. Un commercial pressé doit pouvoir enchaîner
   * une série sans toucher la souris.
   */
  useEffect(() => {
    function surTouche(evenement: KeyboardEvent) {
      const cible = evenement.target as HTMLElement | null;
      if (cible?.tagName === 'INPUT' || cible?.tagName === 'TEXTAREA') return;

      // Confirmation ouverte : plus rien ne passe derrière, sauf Échap qui la
      // ferme. Sinon Entrée validerait la question qu'on ne voit plus.
      if (confirmerQuitter) {
        if (evenement.key === 'Escape') {
          evenement.preventDefault();
          setConfirmerQuitter(false);
        }
        return;
      }

      if (evenement.key === 'Enter') {
        evenement.preventDefault();
        if (etape === 'question') void valider();
        else if (etape === 'correction') void suivante();
        return;
      }

      if (etape !== 'question' || !question) return;

      // Sur un vrai ou faux, V et F répondent directement. Ils s'ajoutent aux
      // chiffres, ils ne les remplacent pas : les deux options portent les
      // repères 1 et 2 à l'écran, et un repère affiché doit répondre.
      if (question.type === 'vf') {
        const lettre = evenement.key.toLowerCase();
        if (lettre === 'v' || lettre === 'f') {
          const cherche = lettre === 'v' ? 'vrai' : 'faux';
          const trouvee =
            question.ordreOptions.find(
              (identifiant) =>
                (question.options[identifiant] ?? '').toLowerCase().startsWith(cherche),
            ) ?? question.ordreOptions[lettre === 'v' ? 0 : 1];
          if (trouvee) {
            evenement.preventDefault();
            basculer(trouvee);
            return;
          }
        }
      }

      const rang = Number.parseInt(evenement.key, 10);
      if (!Number.isFinite(rang) || rang < 1 || rang > question.ordreOptions.length) return;
      evenement.preventDefault();
      const identifiant = question.ordreOptions[rang - 1];
      if (identifiant) basculer(identifiant);
    }

    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [basculer, confirmerQuitter, etape, question, suivante, valider]);

  if (chargement.etat === 'chargement' || chargement.etat === 'anonyme' || ordre === null) {
    return (
      <div style={{ padding: 'clamp(20px, 3.2vw, 36px) clamp(16px, 3.2vw, 40px)' }}>
        <Squelettes lignes={4} />
      </div>
    );
  }

  if (chargement.etat === 'erreur') {
    return (
      <div style={{ padding: 'clamp(20px, 3.2vw, 36px) clamp(16px, 3.2vw, 40px)' }}>
        <EtatErreur titre="Série indisponible" texte={chargement.echec.texte} />
      </div>
    );
  }

  if (ordre.length === 0) {
    return (
      <div style={{ padding: 'clamp(20px, 3.2vw, 36px) clamp(16px, 3.2vw, 40px)' }}>
        <EtatVide
          icone="layers"
          titre={rattrapage ? 'Rien à rattraper' : 'Aucune question disponible'}
          texte={
            rattrapage
              ? 'Toutes vos dernières tentatives sont justes. Lancez une série ordinaire pour continuer.'
              : 'Aucune question n’est publiée pour l’instant. L’entraînement s’ouvrira dès qu’il y en aura.'
          }
          actions={
            <Bouton variante="secondaire" href={ROUTE_ACCUEIL}>
              Revenir à l’accueil
            </Bouton>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <EnteteSerie
        position={position}
        total={ordre.length}
        resultats={resultats}
        terminee={etape === 'fin'}
        confirmation={confirmerQuitter}
        onQuitter={() => {
          // Rien n'est encore engagé tant qu'aucune réponse n'est validée :
          // on ne demande à confirmer que ce qui coûte quelque chose.
          if (etape === 'fin' || passages.length === 0) routeur.push(ROUTE_ACCUEIL);
          else setConfirmerQuitter(true);
        }}
        onConfirmer={() => routeur.push(ROUTE_ACCUEIL)}
        onAnnuler={() => setConfirmerQuitter(false)}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: 'clamp(20px, 3vw, 32px) clamp(16px, 3.2vw, 32px) clamp(24px, 4vw, 48px)',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: 780, maxWidth: '100%' }}>
          {etape === 'fin' ? (
            <FinDeSerie passages={passages} total={ordre.length} />
          ) : question ? (
            etape === 'question' ? (
              <VueQuestion question={question} choisies={choisies} onBasculer={basculer} />
            ) : (
              <VueCorrection passage={passages[passages.length - 1]!} />
            )
          ) : null}

          {erreurEcriture && (
            <div style={{ marginTop: 'var(--space-5)' }}>
              <EtatErreur titre="Enregistrement incomplet" texte={erreurEcriture} />
            </div>
          )}
        </div>
      </div>

      <BarreActions
        etape={etape}
        question={question}
        choisies={choisies}
        enregistrement={enregistrement}
        derniere={position + 1 >= ordre.length}
        passages={passages}
        onValider={() => void valider()}
        onSuivante={() => void suivante()}
        onAccueil={() => routeur.push(ROUTE_ACCUEIL)}
        onRecommencer={recommencer}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ entête */

function EnteteSerie({
  position,
  total,
  resultats,
  terminee,
  confirmation,
  onQuitter,
  onConfirmer,
  onAnnuler,
}: {
  position: number;
  total: number;
  resultats: Record<number, 'ok' | 'ko'>;
  terminee: boolean;
  confirmation: boolean;
  onQuitter: () => void;
  onConfirmer: () => void;
  onAnnuler: () => void;
}) {
  return (
    <header
      style={{
        flex: 'none',
        background: 'var(--surface-card)',
        padding: 'clamp(10px, 2vw, 14px) clamp(16px, 3.2vw, 32px)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          flex: 'none',
          fontSize: 'var(--body-sm-size)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-heading)',
        }}
      >
        {terminee ? (
          'Série terminée'
        ) : (
          <>
            Question {position + 1}
            <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}> sur {total}</span>
          </>
        )}
      </span>

      <span style={{ flex: '1 1 200px', minWidth: 160, maxWidth: 420 }}>
        <ProgressionSerie total={total} courante={position} resultats={resultats} />
      </span>

      {confirmation ? (
        /* Abandonner coûte les étoiles de la série. Le dire au moment du
           geste, pas dans une aide que personne ne lit. */
        <span
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          <Meta style={{ fontSize: 12 }}>
            Série abandonnée : aucune étoile. Vos réponses restent enregistrées.
          </Meta>
          <Bouton taille="sm" variante="secondaire" onClick={onConfirmer}>
            Quitter quand même
          </Bouton>
          <Bouton taille="sm" onClick={onAnnuler} autoFocus>
            Reprendre
          </Bouton>
        </span>
      ) : (
        <button
          type="button"
          onClick={onQuitter}
          style={{
            marginLeft: 'auto',
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            font: 'inherit',
            fontSize: 'var(--body-sm-size)',
            color: 'var(--text-secondary)',
          }}
        >
          <Icone nom="close" taille={16} />
          {terminee ? 'Retour à l’accueil' : 'Quitter la série'}
        </button>
      )}
    </header>
  );
}

/* ----------------------------------------------------------------- question */

function EnTeteQuestion({ question }: { question: Question }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
      <EtiquetteStatut ton="info">{LIBELLES_TYPE[question.type]}</EtiquetteStatut>
      <Meta>{question.theme}</Meta>
    </div>
  );
}

function VueQuestion({
  question,
  choisies,
  onBasculer,
}: {
  question: Question;
  choisies: string[];
  onBasculer: (identifiant: string) => void;
}) {
  const multiple = question.bonnesReponses.length > 1;

  return (
    <div>
      <EnTeteQuestion question={question} />

      {question.type === 'scenario' && question.contexte && (
        <div
          style={{
            marginTop: 'var(--space-4)',
            background: 'var(--surface-sunken)',
            borderRadius: 'var(--radius-lg)',
            padding: '18px 20px',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 'var(--body-md-size)',
              lineHeight: 1.6,
              color: 'var(--neutral-80)',
              textWrap: 'pretty',
            }}
          >
            {question.contexte}
          </p>
        </div>
      )}

      <h1
        style={{
          margin: 'var(--space-5) 0 0',
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize:
            question.type === 'scenario' ? 'clamp(21px, 3.2vw, 28px)' : 'clamp(24px, 4vw, 34px)',
          lineHeight: 1.16,
          color: 'var(--text-heading)',
          textWrap: 'pretty',
        }}
      >
        {question.enonce}
      </h1>

      <p
        style={{
          margin: '14px 0 0',
          fontSize: 'var(--body-sm-size)',
          color: 'var(--text-secondary)',
        }}
      >
        {multiple
          ? `Plusieurs réponses attendues. ${choisies.length} cochée${choisies.length > 1 ? 's' : ''}.`
          : 'Une seule réponse.'}
      </p>

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
            marqueur={String(index + 1)}
            multiple={multiple}
            etat={choisies.includes(identifiant) ? 'selectionnee' : 'repos'}
            onClick={() => onBasculer(identifiant)}
          >
            {question.options[identifiant]}
          </OptionReponse>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- correction */

function VueCorrection({ passage }: { passage: Passage }) {
  const { question, correction } = passage;

  return (
    <div className="grille-deux-colonnes" style={{ gridTemplateColumns: 'minmax(0, 1fr) 300px' }}>
      <div>
        <EnTeteQuestion question={question} />

        <h1
          style={{
            margin: 'var(--space-4) 0 0',
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(20px, 3.2vw, 30px)',
            lineHeight: 1.18,
            color: 'var(--text-heading)',
            textWrap: 'pretty',
          }}
        >
          {question.enonce}
        </h1>

        <div
          style={{
            marginTop: 'var(--space-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {question.ordreOptions.map((identifiant, index) => {
            const etat = correction.etats[identifiant] ?? 'inerte';
            return (
              <OptionReponse
                key={identifiant}
                marqueur={String(index + 1)}
                multiple={question.bonnesReponses.length > 1}
                etat={etat}
                taille="sm"
                note={
                  etat === 'juste'
                    ? 'Votre réponse — juste'
                    : etat === 'manquee'
                      ? 'Attendue — non cochée'
                      : etat === 'fausse'
                        ? 'Votre réponse — fausse'
                        : undefined
                }
              >
                {question.options[identifiant]}
              </OptionReponse>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* L'explication s'affiche même quand la réponse est juste : c'est
            l'argument que le commercial reprendra au téléphone, pas une
            consolation. */}
        <Verdict ton={correction.correcte ? 'ok' : 'ko'} titre={correction.titre} compact>
          {question.explication}
        </Verdict>

        {!correction.correcte && (
          <Meta style={{ fontSize: 12 }}>
            Cette question revient en priorité dans vos prochaines séries, jusqu’à ce que
            vous y répondiez juste.
          </Meta>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ fin de série */

function FinDeSerie({ passages, total }: { passages: Passage[]; total: number }) {
  const justes = passages.filter((passage) => passage.correction.correcte).length;
  const etoiles = etoilesGagnees(justes, total);
  const pourcentage = total === 0 ? 0 : Math.round((justes / total) * 100);

  return (
    <div className="grille-deux-colonnes" style={{ gridTemplateColumns: '286px minmax(0, 1fr)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Carte rayon="var(--radius-xl)" rembourrage="24px 24px 22px">
          <Meta>Série terminée</Meta>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 56,
                lineHeight: 1,
                color: 'var(--text-heading)',
              }}
            >
              {justes}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 26,
                color: 'var(--text-secondary)',
              }}
            >
              / {total}
            </span>
          </span>

          <div style={{ marginTop: 'var(--space-5)' }}>
            <Jauge valeur={pourcentage} />
          </div>

          <div
            style={{
              marginTop: 'var(--space-5)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Icone
              nom="award"
              taille={20}
              couleur={etoiles > 0 ? 'var(--accent-highlight)' : 'var(--neutral-40)'}
            />
            <span style={{ fontSize: 'var(--body-md-size)', color: 'var(--text-body)' }}>
              {etoiles > 0
                ? `${etoiles} étoile${etoiles > 1 ? 's' : ''} gagnée${etoiles > 1 ? 's' : ''}`
                : 'Aucune étoile cette fois'}
            </span>
          </div>

          <p
            style={{
              margin: '14px 0 0',
              fontSize: 'var(--body-sm-size)',
              lineHeight: 1.55,
              color: 'var(--neutral-70)',
              textWrap: 'pretty',
            }}
          >
            {justes === total
              ? 'Série sans faute.'
              : `${total - justes} question${total - justes > 1 ? 's' : ''} à retravailler.`}{' '}
            {LIBELLE_PONDERATION}
          </p>

          {/* Le barème s'affiche là où les étoiles se gagnent. */}
          <Meta style={{ display: 'block', marginTop: 10, fontSize: 12 }}>
            {libelleSeuilsEtoiles()}
          </Meta>
        </Carte>
      </div>

      <div>
        <TitreSection indice={`${total} question${total > 1 ? 's' : ''}`}>
          Récapitulatif
        </TitreSection>

        <div
          style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          {passages.map((passage, index) => {
            const juste = passage.correction.correcte;
            return (
              <div
                key={passage.question.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: '10px 14px',
                  background: juste ? 'var(--surface-card)' : 'rgba(194,66,66,0.06)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: juste ? 'var(--shadow-card-sm)' : 'none',
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    flex: 'none',
                    borderRadius: 999,
                    background: juste ? 'var(--status-success)' : 'var(--status-danger)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icone nom={juste ? 'check' : 'close'} taille={11} epaisseur={2.4} />
                </span>
                <span
                  style={{
                    flex: 'none',
                    width: 18,
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--neutral-60)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span
                  className="titre-recap"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 'var(--body-sm-size)',
                    color: 'var(--text-body)',
                  }}
                >
                  {passage.question.enonce}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ barre du bas */

function BarreActions({
  etape,
  question,
  choisies,
  enregistrement,
  derniere,
  passages,
  onValider,
  onSuivante,
  onAccueil,
  onRecommencer,
}: {
  etape: Etape;
  question: Question | undefined;
  choisies: string[];
  enregistrement: boolean;
  derniere: boolean;
  passages: Passage[];
  onValider: () => void;
  onSuivante: () => void;
  onAccueil: () => void;
  onRecommencer: (mode: 'ordinaire' | 'rattrapage') => void;
}) {
  const multiple = (question?.bonnesReponses.length ?? 0) > 1;
  const nombreOptions = question?.ordreOptions.length ?? 0;

  return (
    <footer
      style={{
        flex: 'none',
        background: 'var(--surface-card)',
        padding: 'clamp(14px, 2.4vw, 18px) clamp(16px, 3.2vw, 32px)',
        position: 'sticky',
        bottom: 0,
      }}
    >
      <div
        style={{
          width: 780,
          maxWidth: '100%',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        {etape === 'question' && (
          <>
            <Bouton
              taille="lg"
              disabled={choisies.length === 0 || enregistrement}
              onClick={onValider}
            >
              {enregistrement ? 'Enregistrement…' : 'Valider ma réponse'}
            </Bouton>
            {choisies.length === 0 ? (
              <Meta>
                {multiple ? 'Cochez au moins une réponse.' : 'Choisissez une réponse pour continuer.'}
              </Meta>
            ) : (
              <span
                className="aide-clavier"
                style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
              >
                {question?.type === 'vf' ? (
                  <>
                    <Touche>V</Touche>
                    <Touche>F</Touche>
                  </>
                ) : (
                  Array.from({ length: Math.min(nombreOptions, 6) }).map((_, index) => (
                    <Touche key={index}>{index + 1}</Touche>
                  ))
                )}
                <Meta style={{ fontSize: 12 }}>pour cocher</Meta>
                <Touche>Entrée</Touche>
                <Meta style={{ fontSize: 12 }}>pour valider</Meta>
              </span>
            )}
          </>
        )}

        {etape === 'correction' && (
          <>
            <Bouton taille="lg" onClick={onSuivante}>
              {derniere ? 'Voir mon résultat' : 'Question suivante'}
            </Bouton>
            <span
              className="aide-clavier"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Touche>Entrée</Touche>
              <Meta style={{ fontSize: 12 }}>pour continuer</Meta>
            </span>
          </>
        )}

        {etape === 'fin' && (
          <>
            <Bouton taille="lg" onClick={() => onRecommencer('ordinaire')}>
              Nouvelle série
            </Bouton>
            {passages.some((passage) => !passage.correction.correcte) && (
              <Bouton
                taille="lg"
                variante="secondaire"
                onClick={() => onRecommencer('rattrapage')}
              >
                Revoir mes erreurs
              </Bouton>
            )}
            <Bouton variante="fantome" onClick={onAccueil}>
              Retour à l’accueil
            </Bouton>
          </>
        )}
      </div>
    </footer>
  );
}
