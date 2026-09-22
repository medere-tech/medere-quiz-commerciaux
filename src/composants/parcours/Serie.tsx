'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';

import { usePrechargementCertain } from '@/lib/navigation/intention';

import { Bouton, Carte, EtiquetteStatut, Meta, Touche, TitreSection } from '@/composants/ds/primitives';
import { EtatErreur, EtatVide, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import {
  ConsigneReponses,
  GroupeDeReponses,
  Jauge,
  OptionReponse,
  ProgressionSerie,
  Argumentaire,
  SignatureExplication,
  Verdict,
} from '@/composants/ds/parcours';
import {
  useDonneesParcours,
  type ParcoursSeme,
  type Referentiel,
} from '@/composants/parcours/donnees';
import { Collage } from '@/composants/session/Collage';
import { Picto } from '@/composants/ds/Picto';
import { Marque } from '@/composants/ds/Coquille';
import type { Question } from '@/lib/questions/depot';
import { libelleAttendu } from '@/lib/questions/modele';
import { crediterSerie, enregistrerReponse } from '@/lib/serie/depot';
import { mesurerCatalogue, RECOMPENSES } from '@/lib/serie/recompenses';
import { avancementParFormation } from '@/lib/serie/maitrise';
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
  tirageCourt,
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

/** Rattache la consigne au groupe d'options pour les lecteurs d'écran. */
const CONSIGNE = 'consigne-reponses';

const ROUTE_ACCUEIL: Route = '/';

type Etape = 'question' | 'correction' | 'fin';

type Passage = {
  question: Question;
  choisies: string[];
  correction: Correction;
};

/**
 * **Le seul écran qui reçoit le contenu de toutes les questions publiées**, et
 * la raison est structurelle : le tirage est pondéré par la maîtrise, qui est
 * privée et lue par le navigateur. Le serveur ne sait donc pas quelles dix
 * questions il devra servir, et ne peut pas les envoyer seules.
 *
 * L'alternative — tirer d'abord, puis aller chercher le contenu des dix — a
 * été mesurée et écartée pour l'instant : elle échange quelques dizaines de
 * kilo-octets contre un aller-retour supplémentaire avant la première
 * question. Le compte y sera lorsque la banque aura grossi ; le seuil est
 * calculé au README.
 */
export function Serie({
  referentiel,
  parcours,
}: {
  referentiel: Referentiel<Question>;
  /** Semé par le serveur : la première question est tirée sans lecture cliente. */
  parcours?: ParcoursSeme;
}) {
  const routeur = useRouter();
  // D'une serie, on revient toujours a l'accueil : autant le charger pendant
  // que le commercial repond, quand le reseau ne fait rien.
  usePrechargementCertain(ROUTE_ACCUEIL);
  const requete = useSearchParams();
  const rattrapage = requete.get('mode') === 'rattrapage';
  /*
   * **« Retravailler » : une question, et rien d'autre.**
   *
   * C'est ce que le bouton promet sur sa ligne — retravailler *cette*
   * question, pas jouer une série. L'écran est le même : question, correction,
   * explication. Ce qui change est ce qui vient après, et c'est délibéré :
   * **une révision ne crédite rien**. Ni étoile, ni série terminée, ni jour
   * d'assiduité, ni récompense. La réponse, elle, compte pleinement : l'état
   * est écrit, la question sort de « à revoir » si elle est juste, et la
   * statistique agrégée la reçoit.
   *
   * Sans cette règle, le bouton serait une machine à étoiles : une question
   * juste vaut 100 %, et dix clics vaudraient dix séries.
   */
  const revision = requete.get('question') ?? null;

  const chargement = useDonneesParcours(referentiel, parcours);

  // Tirée une fois, conservée : c'est elle qui rend la série reproductible.
  const [graine, setGraine] = useState(graineNeuve);
  const [confirmerQuitter, setConfirmerQuitter] = useState(false);
  /* Les paliers franchis par cette série. Annoncés une fois, à la fin. */
  const [nouvellesRecompenses, setNouvellesRecompenses] = useState<string[]>([]);
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
    /* Une révision ne tire rien : la question est nommée dans l'adresse. Elle
       doit exister et être servie — un identifiant inventé ne doit pas ouvrir
       un écran vide, mais l'état « rien à revoir ». */
    if (revision !== null) {
      return chargement.donnees.questions.some((question) => question.id === revision)
        ? [revision]
        : [];
    }
    const hasard = generateurAleatoire(graine);
    const etats = chargement.donnees.etats;
    return rattrapage
      ? tirerRattrapage(etats, TAILLE_SERIE, hasard)
      : tirerSerie(etats, TAILLE_SERIE, hasard);
  }, [chargement, graine, rattrapage, revision]);

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
      // rapporte, pas la dernière réponse. Et une révision ne rapporte rien —
      // voir `revision` plus haut.
      if (revision === null && !creditee.current && chargement.etat === 'pret') {
        creditee.current = true;
        const justes = [...passages].filter((passage) => passage.correction.correcte).length;
        const etoiles = etoilesGagnees(justes, ordre.length);

        /*
         * **Les états sont rafraîchis en mémoire, pas relus.**
         *
         * Ceux que la page a chargés datent de son ouverture : ils ignorent
         * les dix réponses qui viennent d'être données. Les relire coûterait
         * une lecture de collection à chaque fin de série ; les corriger avec
         * ce qu'on vient de faire donne le même résultat, gratuitement.
         */
        const { etats, questions, formations } = chargement.donnees;
        const verdicts = new Map(
          passages.map((passage) => [passage.question.id, passage.correction.correcte]),
        );
        const apres = etats.map((etat) =>
          verdicts.has(etat.id)
            ? { ...etat, dejaVue: true, derniereRatee: !verdicts.get(etat.id) }
            : etat,
        );

        const scenarios = new Set(
          questions.filter((question) => question.type === 'scenario').map((q) => q.id),
        );

        try {
          const gagnees = await crediterSerie(chargement.donnees.uid, etoiles, {
            parfaite: justes === ordre.length,
            catalogue: mesurerCatalogue(
              avancementParFormation(formations, questions, apres),
              apres.filter((etat) => scenarios.has(etat.id)),
            ),
          });
          setNouvellesRecompenses(gagnees);
        } catch {
          setErreurEcriture('Vos étoiles n’ont pas pu être enregistrées. Vos réponses, si.');
        }
      }
      return;
    }

    setPosition((precedente) => precedente + 1);
    setChoisies([]);
    setEtape('question');
  }, [chargement, etape, ordre, passages, position, revision]);

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
          titre={
            revision !== null
              ? 'Cette question n’est plus disponible'
              : rattrapage
                ? 'Rien à rattraper'
                : 'Aucune question disponible'
          }
          texte={
            revision !== null
              ? 'Elle a pu être retirée depuis l’ouverture de votre liste. Les autres vous attendent.'
              : rattrapage
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
        revision={revision !== null}
        onQuitter={() => {
          /*
           * Rien n'est encore engagé tant qu'aucune réponse n'est validée :
           * on ne demande à confirmer que ce qui coûte quelque chose. Et une
           * révision ne coûte rien — elle ne crédite rien : on sort sans
           * question, vers la liste d'où l'on vient.
           */
          const sortie = revision !== null ? ('/a-revoir' as Route) : ROUTE_ACCUEIL;
          if (revision !== null || etape === 'fin' || passages.length === 0) routeur.push(sortie);
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
            <FinDeSerie
              passages={passages}
              total={ordre.length}
              nouvelles={nouvellesRecompenses}
              revision={revision !== null}
            />
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
        revision={revision !== null}
        onValider={() => void valider()}
        onSuivante={() => void suivante()}
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
  revision,
  onQuitter,
  onConfirmer,
  onAnnuler,
}: {
  position: number;
  total: number;
  resultats: Record<number, 'ok' | 'ko'>;
  terminee: boolean;
  confirmation: boolean;
  /** Une question retravaillée : ni série à quitter, ni avancement à suivre. */
  revision: boolean;
  onQuitter: () => void;
  onConfirmer: () => void;
  onAnnuler: () => void;
}) {
  return (
    /*
     * **La barre ne part jamais.**
     *
     * La maquette en fait un cadre de hauteur fixe : l'avancement de la série
     * reste sous les yeux du début à la fin. Sur une page réelle, à 375 px,
     * une question longue fait défiler — et la barre partait avec. `sticky`
     * rend le cadre dessiné : le conteneur de défilement est la fenêtre, la
     * page n'a pas de zone propre, la barre tient.
     */
    <header
      style={{
        flex: 'none',
        position: 'sticky',
        top: 0,
        zIndex: 2,
        background: 'var(--surface-card)',
        padding: 'clamp(10px, 2vw, 14px) clamp(16px, 3.2vw, 32px)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
      }}
    >
      {/* La marque, comme dans la maquette bureau. Le téléphone s'en passe :
          la maquette mobile ne la dessine pas, et la place y manque. */}
      <span className="serie-marque" style={{ flex: 'none' }}>
        <Marque contexte="Quiz Médéré" taille={26} />
      </span>

      <span
        style={{
          flex: 'none',
          fontSize: 'var(--body-sm-size)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-heading)',
        }}
      >
        {/* **Un « sur 1 » n'apprend rien, et une jauge d'un cran non plus.**
            Une question retravaillée n'a pas d'avancement : elle se nomme. */}
        {revision ? (
          'Question à revoir'
        ) : terminee ? (
          'Série terminée'
        ) : (
          <>
            Question {position + 1}
            <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}> sur {total}</span>
          </>
        )}
      </span>

      {!revision && (
        <span style={{ flex: '1 1 200px', minWidth: 160, maxWidth: 420 }}>
          <ProgressionSerie total={total} courante={position} resultats={resultats} />
        </span>
      )}

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
          {revision ? 'Revenir à ma liste' : terminee ? 'Retour à l’accueil' : 'Quitter la série'}
        </button>
      )}
    </header>
  );
}

/* ----------------------------------------------------------------- question */

function EnTeteQuestion({ question }: { question: Question }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
      <EtiquetteStatut ton="info">{libelleAttendu(question)}</EtiquetteStatut>
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
          /* La maquette mobile pose l'énoncé à 26 px : c'est le texte qu'on
             lit, et 24 le rendait plus petit qu'une option de réponse à deux
             lignes. La mise en situation reste un cran en dessous, son contexte
             étant déjà affiché au-dessus. */
          fontSize:
            question.type === 'scenario' ? 'clamp(23px, 3.2vw, 28px)' : 'clamp(26px, 4vw, 34px)',
          lineHeight: 1.16,
          color: 'var(--text-heading)',
          textWrap: 'pretty',
        }}
      >
        {question.enonce}
      </h1>

      <ConsigneReponses
        id={CONSIGNE}
        multiple={multiple}
        complement={
          multiple
            ? `${choisies.length} cochée${choisies.length > 1 ? 's' : ''}.`
            : undefined
        }
      />

      <GroupeDeReponses
        decritPar={CONSIGNE}
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
      </GroupeDeReponses>
    </div>
  );
}

/* --------------------------------------------------------------- correction */

function VueCorrection({ passage }: { passage: Passage }) {
  const { question, correction } = passage;

  return (
    <div
      className="grille-deux-colonnes correction-grille"
      style={{ gridTemplateColumns: 'minmax(0, 1fr) 300px' }}
    >
      <div>
        <EnTeteQuestion question={question} />

        <h1
          style={{
            margin: 'var(--space-4) 0 0',
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            /* Plus petit que sur l'écran de question : à la correction, c'est
               le verdict qu'on lit d'abord, et la maquette mobile le dit en
               posant l'énoncé à 19 px. */
            fontSize: 'clamp(19px, 3.2vw, 30px)',
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

      <div
        className="correction-verdict"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
      >
        {/* L'explication s'affiche même quand la réponse est juste : c'est
            l'argument que le commercial reprendra au téléphone, pas une
            consolation. */}
        <Verdict ton={correction.correcte ? 'ok' : 'ko'} titre={correction.titre} compact>
          {question.explication}
        </Verdict>

        {/* L'angle de vente, quand il y en a un. Vide, la carte ne paraît pas :
            une question de fait n'a pas d'argumentaire, et une carte creuse
            apprend à sauter la carte. */}
        {question.argumentaire.trim().length > 0 && (
          <Argumentaire>{question.argumentaire}</Argumentaire>
        )}

        <SignatureExplication
          auteur={question.explicationAuteur}
          majLe={question.explicationMajLe}
        />

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

function FinDeSerie({
  passages,
  total,
  nouvelles,
  revision,
}: {
  passages: Passage[];
  total: number;
  /** Identifiants des récompenses gagnées par cette série. */
  nouvelles: string[];
  /** Une question retravaillée depuis « À revoir » : rien n'est crédité. */
  revision: boolean;
}) {
  const justes = passages.filter((passage) => passage.correction.correcte).length;
  const etoiles = revision ? 0 : etoilesGagnees(justes, total);
  const pourcentage = total === 0 ? 0 : Math.round((justes / total) * 100);
  /* Une clé que le code ne connaît plus ne rend rien, plutôt que de faire
     tomber l'écran de fin de série. */
  const gagnees = RECOMPENSES.filter((recompense) => nouvelles.includes(recompense.id));

  return (
    <div className="grille-deux-colonnes" style={{ gridTemplateColumns: '286px minmax(0, 1fr)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Carte
          rayon="var(--radius-xl)"
          rembourrage="24px 24px 22px"
          style={{ position: 'relative', overflow: 'hidden' }}
        >
          {/*
            * Les deux formes de la maquette, débordant du coin haut droit.
            * C'est le seul décor du parcours : la fin de série est le moment
            * où l'on relève la tête, et le seul où la marque a le droit de se
            * montrer sans gêner la lecture.
            */}
          <Collage
            formes={[
              { fichier: 'forme-3-17BEBB.svg', taille: 118, x: 196, y: -60, rotation: -14 },
              { fichier: 'forme-5-FECA45.svg', taille: 74, x: 252, y: 30, rotation: 24 },
            ]}
          />
          <Meta style={{ position: 'relative' }}>
            {revision ? 'Question retravaillée' : 'Série terminée'}
          </Meta>
          <span
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'baseline',
              gap: 6,
              marginTop: 6,
            }}
          >
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

          <div style={{ position: 'relative', marginTop: 'var(--space-5)' }}>
            <Jauge valeur={pourcentage} />
          </div>

          <div
            style={{
              position: 'relative',
              marginTop: 'var(--space-5)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Icone
              nom={revision ? 'refresh' : 'award'}
              taille={20}
              couleur={etoiles > 0 ? 'var(--accent-highlight)' : 'var(--neutral-40)'}
            />
            <span style={{ fontSize: 'var(--body-md-size)', color: 'var(--text-body)' }}>
              {revision
                ? 'Révision enregistrée'
                : etoiles > 0
                  ? `${etoiles} étoile${etoiles > 1 ? 's' : ''} gagnée${etoiles > 1 ? 's' : ''}`
                  : 'Aucune étoile cette fois'}
            </span>
          </div>

          <p
            style={{
              position: 'relative',
              margin: '14px 0 0',
              fontSize: 'var(--body-sm-size)',
              lineHeight: 1.55,
              color: 'var(--neutral-70)',
              textWrap: 'pretty',
            }}
          >
            {revision
              ? justes === total
                ? 'Votre réponse est juste : cette question sort de vos questions à revoir.'
                : 'Toujours ratée : elle reste dans vos questions à revoir et reviendra en priorité.'
              : `${
                  justes === total
                    ? 'Série sans faute.'
                    : `${total - justes} question${total - justes > 1 ? 's' : ''} à retravailler.`
                } ${LIBELLE_PONDERATION}`}
          </p>

          {/*
            * **Un zéro sans explication passe pour une panne.**
            *
            * Deux cas le produisent, et chacun mérite sa phrase. Une révision
            * ne compte pas comme une série : c'est le prix de pouvoir
            * retravailler une question à la demande sans fabriquer des étoiles
            * à la chaîne. Un tirage court — un rattrapage où il ne restait que
            * trois questions — vaut ce qu'il pèse sur dix, et peut donc valoir
            * zéro en étant parfait.
            */}
          <Meta style={{ display: 'block', marginTop: 10, fontSize: 12 }}>
            {revision
              ? 'Une question retravaillée ne compte pas comme une série : ni étoile, ni jour d’assiduité. Votre réponse, elle, compte.'
              : tirageCourt(total)
                ? `Les étoiles se comptent sur une série de dix. Celle-ci en comptait ${total}. ${libelleSeuilsEtoiles()}`
                : libelleSeuilsEtoiles()}
          </Meta>
        </Carte>

        {/*
          * Les paliers franchis par cette série, annoncés là où on les a
          * gagnés. La maquette les pose sous le score, avec leur étiquette
          * « nouveau » — c'est la seule fois où ils se voient au moment même.
          */}
        {gagnees.length > 0 && (
          <Carte rayon="var(--radius-lg)" rembourrage="16px 18px" elevation="petite">
            <TitreSection>
              {gagnees.length === 1 ? 'Récompense obtenue' : 'Récompenses obtenues'}
            </TitreSection>
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {gagnees.map((recompense) => (
                <span
                  key={recompense.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      flex: 'none',
                      borderRadius: 999,
                      background: recompense.teinte,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Picto nom={recompense.picto} taille={22} />
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 'var(--body-sm-size)',
                      lineHeight: 1.35,
                      color: 'var(--text-body)',
                      textWrap: 'pretty',
                    }}
                  >
                    {recompense.libelle}
                  </span>
                  <EtiquetteStatut ton="publiee">Nouveau</EtiquetteStatut>
                </span>
              ))}
            </div>
          </Carte>
        )}
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
  revision,
  onValider,
  onSuivante,
  onRecommencer,
}: {
  etape: Etape;
  question: Question | undefined;
  choisies: string[];
  enregistrement: boolean;
  derniere: boolean;
  passages: Passage[];
  /** Une question retravaillée : on revient à la liste, on n'enchaîne pas. */
  revision: boolean;
  onValider: () => void;
  onSuivante: () => void;
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
        className="serie-actions"
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
              /* La consigne vit déjà sous l'énoncé, et le bouton désactivé dit
                 le reste. Sur téléphone, la répéter ici volait la pleine
                 largeur au geste : la maquette mobile ne la dessine pas. */
              <Meta className="serie-indication">
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
              {revision ? 'Terminer' : derniere ? 'Voir mon résultat' : 'Question suivante'}
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
            {/*
              * **On revient d'où l'on vient.** Une question retravaillée se
              * lance depuis « À revoir », et c'est là qu'il reste du travail :
              * proposer « Nouvelle série » enverrait ailleurs quelqu'un qui
              * est venu pour une liste.
              */}
            {revision ? (
              <Bouton taille="lg" href={'/a-revoir' as Route}>
                Revenir à mes questions à revoir
              </Bouton>
            ) : (
              <Bouton taille="lg" onClick={() => onRecommencer('ordinaire')}>
                Nouvelle série
              </Bouton>
            )}
            {!revision && passages.some((passage) => !passage.correction.correcte) && (
              <Bouton
                taille="lg"
                variante="secondaire"
                onClick={() => onRecommencer('rattrapage')}
              >
                Revoir mes erreurs
              </Bouton>
            )}
            {/* « Retour à l'accueil » vivait ici en plus du lien de l'en-tête,
                qui porte exactement ce libellé une fois la série finie. Un même
                geste à deux endroits du même écran n'en fait pas un plus
                accessible. */}
          </>
        )}
      </div>
    </footer>
  );
}
