'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useIntentionDeNavigation } from '@/lib/navigation/intention';

import {
  Bouton,
  Carte,
  Champ,
  EtiquetteStatut,
  Meta,
  Onglets,
  Selecteur,
  TitrePage,
  Touche,
} from '@/composants/ds/primitives';
import { EtatErreur, EtatVide, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import {
  LIBELLES_STATUT,
  LIBELLES_TYPE,
  TYPES_QUESTION,
  type TypeQuestion,
} from '@/lib/questions/modele';
import { chargerFormations, type Formation } from '@/lib/formations/depot';
import {
  chargerPageQuestions,
  chargerToutesLesQuestions,
  compterQuestions,
  dupliquerQuestion,
  PLAFOND_RECHERCHE,
  type FiltresQuestions,
  type Question,
  type TriQuestions,
} from '@/lib/questions/depot';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { authentification } from '@/lib/firebase/client';
import { echecDeLecture, type EchecDeLecture } from '@/lib/firebase/erreurs';
import { entierBorne, useParametresUrl } from '@/lib/navigation/parametres-url';
import { ChargerPlus } from '@/composants/admin/ChargerPlus';
import { sansAccentNiCasse } from '@/lib/texte';

/**
 * 06 · Banque de questions.
 *
 * Filtrage par formation, par format et par statut, recherche sur l'énoncé.
 * La recherche se fait dans le navigateur : Firestore ne sait pas chercher
 * dans un texte, et quelques centaines de questions se filtrent sans délai.
 */

type FiltreStatut = 'tout' | 'publiee' | 'brouillon';

const ONGLETS_STATUT = [
  { valeur: 'tout' as const, libelle: 'Tout' },
  { valeur: 'publiee' as const, libelle: 'Publiées' },
  { valeur: 'brouillon' as const, libelle: 'Brouillons' },
];

/**
 * Les routes typées de Next n'acceptent pas toujours un littéral passé
 * directement à `router.push`. L'annoter une fois, comme le fait la coquille
 * pour sa navigation, vaut mieux qu'un cast à chaque appel.
 */
const ROUTE_IMPORT: Route = '/admin/import';

/** Combien de lignes de plus à chaque « voir plus ». */
const PAR_PAGE = 50;

const TRIS = [
  { valeur: 'recentes', libelle: 'Modifiées en dernier' },
  { valeur: 'anciennes', libelle: 'Modifiées il y a longtemps' },
  { valeur: 'alpha', libelle: 'Énoncé de A à Z' },
] as const;

type Tri = (typeof TRIS)[number]['valeur'];

/**
 * L'état de la liste, tenu par l'URL. Les valeurs par défaut ne s'y écrivent
 * pas : `/admin/questions` reste l'adresse de la vue par défaut.
 */
const DEFAUTS = {
  q: '',
  formation: 'toutes',
  type: 'tous',
  statut: 'tout',
  tri: 'recentes',
  vus: String(PAR_PAGE),
  /** Question qu'on vient de quitter : on la remet sous les yeux. */
  surligne: '',
};

function dateCourte(valeur: Date | null): string {
  if (!valeur) return '—';
  return valeur.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

export default function PageBanque() {
  const router = useRouter();
  const intention = useIntentionDeNavigation();
  const champRecherche = useRef<HTMLInputElement>(null);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [chargementSuite, setChargementSuite] = useState(false);
  const [erreur, setErreur] = useState<EchecDeLecture>();
  const [duplicationEnCours, setDuplicationEnCours] = useState<string>();
  /** Totaux exacts, obtenus par agrégat sans lire les documents. */
  const [total, setTotal] = useState(0);
  const [totalBanque, setTotalBanque] = useState(0);
  const [totalPubliees, setTotalPubliees] = useState(0);
  const [plafondAtteint, setPlafondAtteint] = useState(false);
  const curseur = useRef<QueryDocumentSnapshot | null>(null);
  const [rechargements, setRechargements] = useState(0);

  const { valeurs, definir, chaine } = useParametresUrl(DEFAUTS);
  const recherche = valeurs.q;
  const formationId = valeurs.formation;
  const type = valeurs.type;
  const statut = valeurs.statut as FiltreStatut;
  const tri = valeurs.tri as Tri;
  const vus = entierBorne(valeurs.vus, PAR_PAGE, 1);

  /**
   * Filtrer, chercher ou trier repose la question : on repart du haut de la
   * liste. Continuer à afficher trois cents lignes d'un filtre qu'on vient de
   * changer n'aurait aucun sens.
   */
  const filtrer = (modifications: Partial<typeof DEFAUTS>) =>
    definir({ ...modifications, vus: String(PAR_PAGE), surligne: '' });

  /**
   * Les filtres partent dans la requête. Ce qui vaut « tous » ne s'y écrit
   * pas : une contrainte en moins, c'est un index en moins à déclarer.
   */
  const filtres: FiltresQuestions = useMemo(
    () => ({
      ...(statut === 'tout' ? {} : { statut }),
      ...(type === 'tous' ? {} : { type: type as TypeQuestion }),
      ...(formationId === 'toutes' ? {} : { formationId }),
    }),
    [statut, type, formationId],
  );

  /** Une recherche porte sur l'ensemble filtré, pas sur la page affichée. */
  const enRecherche = recherche.trim().length > 0;

  const cle = `${statut}|${type}|${formationId}|${tri}|${enRecherche}|${rechargements}`;

  useEffect(() => {
    let vivant = true;

    async function charger() {
      setChargement(true);
      setErreur(undefined);
      curseur.current = null;

      /*
       * Rien n'oblige la liste à attendre les compteurs. Les agrégats partent
       * en même temps qu'elle et se posent dès qu'ils arrivent : le pied de
       * liste et l'en-tête se complètent sous les yeux plutôt que de retarder
       * les lignes. Chaque compteur porte son propre `catch` — un total
       * manquant n'est pas une raison de vider l'écran.
       */
      const poser = <T,>(promesse: Promise<T>, appliquer: (valeur: T) => void) => {
        void promesse.then(
          (valeur) => {
            if (vivant) appliquer(valeur);
          },
          (probleme) => {
            console.error('Compteur indisponible', probleme);
          },
        );
      };

      poser(chargerFormations(), setFormations);
      poser(compterQuestions(filtres), setTotal);
      // L'en-tête décrit la banque, pas le filtre en cours ni la page chargée :
      // compter les lignes à l'écran donnerait un chiffre faux.
      poser(compterQuestions({}), setTotalBanque);
      poser(compterQuestions({ statut: 'publiee' }), setTotalPubliees);

      try {
        if (enRecherche) {
          // Firestore ne cherche pas dans un texte : pour chercher, il faut
          // avoir sous la main l'ensemble que les filtres ont déjà réduit.
          const { questions: toutes, atteintLePlafond } = await chargerToutesLesQuestions(
            filtres,
            tri as TriQuestions,
          );
          if (!vivant) return;
          setQuestions(toutes);
          setPlafondAtteint(atteintLePlafond);
        } else {
          /*
           * Un curseur ne tient pas dans une URL. Pour que le retour depuis
           * l'éditeur retrouve la ligne qu'on tenait — trois pages plus bas —
           * on rejoue autant de pages que `vus` en demande. Coût : quelques
           * requêtes séquentielles au retour, contre la banque entière avant.
           */
          const cumul: Question[] = [];
          let suivant: QueryDocumentSnapshot | null = null;
          let reste = true;

          while (reste && cumul.length < Math.max(vus, PAR_PAGE)) {
            const page = await chargerPageQuestions(
              filtres,
              tri as TriQuestions,
              PAR_PAGE,
              suivant,
            );
            if (!vivant) return;
            cumul.push(...page.questions);
            suivant = page.curseur;
            reste = page.encore;
          }

          setQuestions(cumul);
          curseur.current = suivant;
          setPlafondAtteint(false);
        }
      } catch (probleme) {
        if (!vivant) return;
        // La liste précédente ne décrit plus le filtre demandé : la garder à
        // l'écran ferait passer un filtre en échec pour un filtre appliqué.
        setQuestions([]);
        setErreur(echecDeLecture(probleme, 'la banque de questions'));
      } finally {
        if (vivant) setChargement(false);
      }
    }

    void charger();
    return () => {
      vivant = false;
    };
    // `cle` résume les filtres, le tri et les rechargements demandés.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  async function pageSuivante() {
    if (chargementSuite || !curseur.current) return;
    setChargementSuite(true);
    try {
      const page = await chargerPageQuestions(
        filtres,
        tri as TriQuestions,
        PAR_PAGE,
        curseur.current,
      );
      setQuestions((precedentes) => [...precedentes, ...page.questions]);
      curseur.current = page.curseur;
    } catch (probleme) {
      setErreur(echecDeLecture(probleme, 'la banque de questions'));
    } finally {
      setChargementSuite(false);
    }
  }

  function recharger() {
    setRechargements((precedents) => precedents + 1);
  }

  // La barre oblique met le curseur dans la recherche, comme le prévoit la
  // maquette : on balaie la banque au clavier.
  useEffect(() => {
    function surTouche(evenement: KeyboardEvent) {
      const cible = evenement.target as HTMLElement | null;
      const dansUnChamp =
        cible?.tagName === 'INPUT' || cible?.tagName === 'TEXTAREA' || cible?.isContentEditable;
      if (evenement.key === '/' && !dansUnChamp) {
        evenement.preventDefault();
        champRecherche.current?.focus();
      }
    }
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, []);

  const nomsFormations = useMemo(
    () => new Map(formations.map((formation) => [formation.id, formation.nom])),
    [formations],
  );

  /**
   * Statut, format, formation et tri sont déjà appliqués par Firestore. Il ne
   * reste ici que la recherche plein texte, que Firestore ne sait pas faire :
   * ni sous-chaîne, ni insensibilité aux accents, ni plusieurs champs à la
   * fois. Elle s'applique donc à l'ensemble que les filtres ont déjà réduit.
   */
  const filtrees = useMemo(() => {
    const terme = sansAccentNiCasse(recherche);
    if (terme.length === 0) return questions;

    return questions.filter((question) => {
      // Le nom de la formation est le mot que Noémie a en tête — pas le
      // thème, qu'elle a choisi elle-même il y a trois semaines. Chercher
      // « ménopause » sans rien trouver alors que dix questions y sont
      // rattachées, c'est le moment où l'on conclut que l'outil ne marche pas.
      const champs = [
        question.enonce,
        question.theme,
        ...question.formationIds.map((identifiant) => nomsFormations.get(identifiant) ?? ''),
      ];
      return champs.some((champ) => sansAccentNiCasse(champ).includes(terme));
    });
  }, [questions, recherche, nomsFormations]);

  // En recherche, tout ce qui correspond est affiché : la pagination porte sur
  // la requête serveur, pas sur le filtre du navigateur.
  const visibles = enRecherche ? filtrees : filtrees.slice(0, vus);

  /**
   * Retour d'édition : la question qu'on vient de quitter est ramenée sous
   * les yeux. Sans cela, revenir d'une correction fait rouvrir la liste en
   * haut, et il faut retrouver à la main la ligne qu'on tenait.
   */
  useEffect(() => {
    if (!valeurs.surligne || chargement) return;
    const ligne = document.getElementById(`question-${valeurs.surligne}`);
    ligne?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [valeurs.surligne, chargement, vus]);

  /** Lien vers l'éditeur, en emportant de quoi revenir exactement ici. */
  const versEditeur = (identifiant: string) => {
    const retour = new URLSearchParams(chaine);
    retour.set('surligne', identifiant);
    return `/admin/questions/${identifiant}?retour=${encodeURIComponent(retour.toString())}`;
  };

  const publiees = totalPubliees;

  async function dupliquer(question: Question) {
    const utilisateur = authentification().currentUser;
    if (!utilisateur) return;

    setDuplicationEnCours(question.id);
    try {
      const identifiant = await dupliquerQuestion(question, utilisateur.uid);
      router.push(`/admin/questions/${identifiant}`);
    } catch {
      // Un échec d'écriture, pas de lecture : la banque affichée reste valable,
      // et réessayer a du sens.
      setErreur({
        texte: "La copie n'a pas pu être créée. La question d'origine n'a pas été touchée.",
        reessayable: true,
      });
      setDuplicationEnCours(undefined);
    }
  }

  return (
    <div className="page-admin">
      <TitrePage
        titre="Banque de questions"
        sous={
          chargement
            ? 'Chargement de la banque.'
            : `${totalBanque} question${totalBanque > 1 ? 's' : ''}, dont ${publiees} publiée${publiees > 1 ? 's' : ''}. Seules les questions publiées entrent dans les séries.`
        }
        actions={
          <>
            <Bouton
              taille="lg"
              variante="secondaire"
              iconeGauche={<Icone nom="upload" taille={16} />}
              href={ROUTE_IMPORT}
            >
              Importer
            </Bouton>
            <Bouton
              taille="lg"
              iconeGauche={<Icone nom="plus" taille={16} />}
              href={'/admin/questions/nouvelle' as Route}
            >
              Nouvelle question
            </Bouton>
          </>
        }
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Champ
          ref={champRecherche}
          value={recherche}
          onChange={(valeur) => filtrer({ q: valeur })}
          placeholder="Rechercher : énoncé, thème ou formation"
          prefixe={<Icone nom="search" taille={17} couleur="var(--neutral-50)" />}
          suffixe={<Touche>/</Touche>}
          style={{ flex: '1 1 240px', minWidth: 0, maxWidth: 340 }}
        />
        <Selecteur
          value={formationId}
          onChange={(valeur) => filtrer({ formation: valeur })}
          style={{ flex: '1 1 200px', minWidth: 0, maxWidth: 240 }}
          options={[
            { valeur: 'toutes', libelle: 'Toutes les formations' },
            ...formations
              .filter((formation) => formation.actif)
              .map((formation) => ({ valeur: formation.id, libelle: formation.nom })),
          ]}
        />
        <Selecteur
          value={type}
          onChange={(valeur) => filtrer({ type: valeur })}
          style={{ flex: '1 1 160px', minWidth: 0, maxWidth: 190 }}
          options={[
            { valeur: 'tous', libelle: 'Tous les formats' },
            ...TYPES_QUESTION.map((valeur) => ({ valeur, libelle: LIBELLES_TYPE[valeur] })),
          ]}
        />
        <Onglets
          items={ONGLETS_STATUT}
          valeur={statut}
          onChange={(valeur) => filtrer({ statut: valeur })}
        />
        <Selecteur
          value={tri}
          onChange={(valeur) => filtrer({ tri: valeur })}
          style={{ flex: '1 1 190px', minWidth: 0, maxWidth: 230 }}
          options={TRIS.map((option) => ({ valeur: option.valeur, libelle: option.libelle }))}
        />
        <span style={{ marginLeft: 'auto' }}>
          <Meta>
            {enRecherche
              ? `${filtrees.length} résultat${filtrees.length > 1 ? 's' : ''} sur ${questions.length} question${questions.length > 1 ? 's' : ''} filtrée${questions.length > 1 ? 's' : ''}`
              : `${visibles.length} question${visibles.length > 1 ? 's' : ''} sur ${total}`}
          </Meta>
        </span>
      </div>

      {erreur && (
        <EtatErreur
          titre="Chargement interrompu"
          texte={erreur.texte}
          action={
            erreur.reessayable ? (
              <Bouton
                variante="secondaire"
                iconeGauche={<Icone nom="refresh" taille={16} />}
                onClick={() => void recharger()}
              >
                Réessayer
              </Bouton>
            ) : undefined
          }
        />
      )}

      {chargement && <Squelettes lignes={6} />}

      {!chargement && !erreur && questions.length === 0 && (
        <EtatVide
          icone="layers"
          titre="Aucune question pour le moment"
          texte="Écrivez la première, ou collez un lot entier depuis votre tableur. Tout ce qui est importé arrive en brouillon."
          actions={
            <>
              <Bouton
                variante="secondaire"
                iconeGauche={<Icone nom="upload" taille={16} />}
                href={ROUTE_IMPORT}
              >
                Importer un lot
              </Bouton>
              <Bouton
                iconeGauche={<Icone nom="plus" taille={16} />}
                href={'/admin/questions/nouvelle' as Route}
              >
                Nouvelle question
              </Bouton>
            </>
          }
        />
      )}

      {plafondAtteint && (
        <Meta>
          Recherche limitée aux {PLAFOND_RECHERCHE} premières questions du filtre. Restreignez par
          formation, format ou statut pour chercher dans l’ensemble.
        </Meta>
      )}

      {!chargement && !erreur && questions.length > 0 && filtrees.length === 0 && (
        <EtatVide
          icone="search"
          titre="Aucune question ne correspond"
          texte="Élargissez la recherche, ou retirez un filtre. La banque, elle, n'a pas changé."
          actions={
            <Bouton
              variante="secondaire"
              onClick={() => {
                filtrer({ q: '', formation: 'toutes', type: 'tous', statut: 'tout' });
              }}
            >
              Effacer les filtres
            </Bouton>
          }
        />
      )}

      {!chargement && filtrees.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            className="entete-colonnes"
            style={{
              display: 'flex',
              gap: 'var(--space-5)',
              padding: '0 20px 10px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--neutral-60)',
            }}
          >
            <span style={{ width: 82, flex: 'none' }}>Statut</span>
            <span style={{ flex: 1 }}>Question</span>
            <span style={{ width: 130, flex: 'none' }}>Format</span>
            <span style={{ width: 110, flex: 'none' }}>Modifiée</span>
            <span style={{ width: 64, flex: 'none' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {visibles.map((question) => (
              <div key={question.id} id={`question-${question.id}`}>
              <Carte
                rayon="var(--radius-md)"
                rembourrage="14px 20px"
                elevation="petite"
                className="ligne-tableau"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-5)',
                  // Cadre complet, jamais un filet d'un seul côté : la ligne
                  // qu'on vient de quitter se retrouve d'un coup d'œil.
                  border:
                    valeurs.surligne === question.id
                      ? '1px solid var(--accent-primary)'
                      : '1px solid transparent',
                }}
              >
                <span className="colonne-fixe" style={{ width: 82, flex: 'none' }}>
                  <EtiquetteStatut ton={question.statut === 'publiee' ? 'publiee' : 'brouillon'}>
                    {LIBELLES_STATUT[question.statut] ?? question.statut}
                  </EtiquetteStatut>
                </span>
                <span className="colonne-souple" style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 'var(--body-md-size)',
                      color: 'var(--text-body)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {question.enonce}
                  </span>
                  <Meta style={{ fontSize: 12 }}>
                    {question.formationIds
                      .map((identifiant) => nomsFormations.get(identifiant) ?? 'Formation retirée')
                      .join(' · ') || 'Aucune formation'}
                  </Meta>
                </span>
                <span
                  className="colonne-fixe"
                  style={{
                    width: 130,
                    flex: 'none',
                    fontSize: 'var(--body-sm-size)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {LIBELLES_TYPE[question.type] ?? question.type}
                </span>
                <span
                  className="colonne-fixe"
                  style={{
                    width: 110,
                    flex: 'none',
                    fontSize: 'var(--body-sm-size)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {dateCourte(question.modifieeLe)}
                </span>
                <span
                  className="colonne-fixe"
                  style={{
                    width: 64,
                    flex: 'none',
                    display: 'flex',
                    gap: 4,
                    justifyContent: 'flex-end',
                    marginLeft: 'auto',
                  }}
                >
                  <button
                    type="button"
                    aria-label={`Modifier : ${question.enonce}`}
                    onClick={() => router.push(versEditeur(question.id) as Route)}
                    {...intention(versEditeur(question.id) as Route)}
                    style={boutonLigne}
                  >
                    <Icone nom="pencil" taille={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Dupliquer : ${question.enonce}`}
                    disabled={duplicationEnCours === question.id}
                    onClick={() => void dupliquer(question)}
                    style={boutonLigne}
                  >
                    <Icone nom="copy" taille={16} />
                  </button>
                </span>
              </Carte>
              </div>
            ))}
          </div>

          <ChargerPlus
            affichees={visibles.length}
            total={enRecherche ? filtrees.length : total}
            parPage={PAR_PAGE}
            nom="questions"
            onPlus={() => {
              definir({ vus: String(vus + PAR_PAGE) });
              void pageSuivante();
            }}
          />
        </div>
      )}
    </div>
  );
}

const boutonLigne = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 'var(--radius-sm)',
  color: 'var(--neutral-50)',
  display: 'flex',
} as const;
