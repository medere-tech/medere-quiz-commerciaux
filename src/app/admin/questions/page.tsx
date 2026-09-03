'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

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
import { LIBELLES_STATUT, LIBELLES_TYPE, TYPES_QUESTION } from '@/lib/questions/modele';
import { chargerFormations, type Formation } from '@/lib/formations/depot';
import { chargerQuestions, dupliquerQuestion, type Question } from '@/lib/questions/depot';
import { authentification } from '@/lib/firebase/client';

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

function dateCourte(valeur: Date | null): string {
  if (!valeur) return '—';
  return valeur.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

export default function PageBanque() {
  const router = useRouter();
  const champRecherche = useRef<HTMLInputElement>(null);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string>();
  const [duplicationEnCours, setDuplicationEnCours] = useState<string>();

  const [recherche, setRecherche] = useState('');
  const [formationId, setFormationId] = useState('toutes');
  const [type, setType] = useState('tous');
  const [statut, setStatut] = useState<FiltreStatut>('tout');

  const MESSAGE_ECHEC =
    "La banque n'a pas pu être chargée. Vos questions sont intactes : c'est la lecture qui a échoué.";

  // Le premier chargement n'écrit aucun état avant son premier `await` :
  // l'écran part déjà en chargement, inutile de le redemander.
  useEffect(() => {
    let vivant = true;

    async function premierChargement() {
      try {
        const [listeQuestions, listeFormations] = await Promise.all([
          chargerQuestions(),
          chargerFormations(),
        ]);
        if (!vivant) return;
        setQuestions(listeQuestions);
        setFormations(listeFormations);
      } catch {
        if (vivant) setErreur(MESSAGE_ECHEC);
      } finally {
        if (vivant) setChargement(false);
      }
    }

    void premierChargement();
    return () => {
      vivant = false;
    };
  }, []);

  async function recharger() {
    setChargement(true);
    setErreur(undefined);
    try {
      const [listeQuestions, listeFormations] = await Promise.all([
        chargerQuestions(),
        chargerFormations(),
      ]);
      setQuestions(listeQuestions);
      setFormations(listeFormations);
    } catch {
      setErreur(MESSAGE_ECHEC);
    } finally {
      setChargement(false);
    }
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

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();

    return questions.filter((question) => {
      if (statut !== 'tout' && question.statut !== statut) return false;
      if (type !== 'tous' && question.type !== type) return false;
      if (formationId !== 'toutes' && !question.formationIds.includes(formationId)) return false;
      if (terme.length > 0) {
        const dansEnonce = question.enonce.toLowerCase().includes(terme);
        const dansTheme = question.theme.toLowerCase().includes(terme);
        if (!dansEnonce && !dansTheme) return false;
      }
      return true;
    });
  }, [questions, recherche, formationId, type, statut]);

  const publiees = questions.filter((question) => question.statut === 'publiee').length;

  async function dupliquer(question: Question) {
    const utilisateur = authentification().currentUser;
    if (!utilisateur) return;

    setDuplicationEnCours(question.id);
    try {
      const identifiant = await dupliquerQuestion(question, utilisateur.uid);
      router.push(`/admin/questions/${identifiant}`);
    } catch {
      setErreur("La copie n'a pas pu être créée. La question d'origine n'a pas été touchée.");
      setDuplicationEnCours(undefined);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '36px 40px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
      }}
    >
      <TitrePage
        titre="Banque de questions"
        sous={
          chargement
            ? 'Chargement de la banque.'
            : `${questions.length} question${questions.length > 1 ? 's' : ''}, dont ${publiees} publiée${publiees > 1 ? 's' : ''}. Seules les questions publiées entrent dans les séries.`
        }
        actions={
          <Bouton
            taille="lg"
            iconeGauche={<Icone nom="plus" taille={16} />}
            onClick={() => router.push('/admin/questions/nouvelle')}
          >
            Nouvelle question
          </Bouton>
        }
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Champ
          ref={champRecherche}
          value={recherche}
          onChange={setRecherche}
          placeholder="Rechercher dans les énoncés"
          prefixe={<Icone nom="search" taille={17} couleur="var(--neutral-50)" />}
          suffixe={<Touche>/</Touche>}
          style={{ width: 340, flex: 'none' }}
        />
        <Selecteur
          value={formationId}
          onChange={setFormationId}
          style={{ width: 240, flex: 'none' }}
          options={[
            { valeur: 'toutes', libelle: 'Toutes les formations' },
            ...formations
              .filter((formation) => formation.actif)
              .map((formation) => ({ valeur: formation.id, libelle: formation.nom })),
          ]}
        />
        <Selecteur
          value={type}
          onChange={setType}
          style={{ width: 190, flex: 'none' }}
          options={[
            { valeur: 'tous', libelle: 'Tous les formats' },
            ...TYPES_QUESTION.map((valeur) => ({ valeur, libelle: LIBELLES_TYPE[valeur] })),
          ]}
        />
        <Onglets items={ONGLETS_STATUT} valeur={statut} onChange={setStatut} />
        <span style={{ marginLeft: 'auto' }}>
          <Meta>
            {filtrees.length} résultat{filtrees.length > 1 ? 's' : ''} sur {questions.length}
          </Meta>
        </span>
      </div>

      {erreur && (
        <EtatErreur
          titre="Chargement interrompu"
          texte={erreur}
          action={
            <Bouton
              variante="secondaire"
              iconeGauche={<Icone nom="refresh" taille={16} />}
              onClick={() => void recharger()}
            >
              Réessayer
            </Bouton>
          }
        />
      )}

      {chargement && <Squelettes lignes={6} />}

      {!chargement && !erreur && questions.length === 0 && (
        <EtatVide
          icone="layers"
          titre="Aucune question pour le moment"
          texte="Écrivez la première. L'import en masse arrive au prochain lot ; en attendant, l'éditeur suffit à constituer la banque."
          actions={
            <Bouton
              iconeGauche={<Icone nom="plus" taille={16} />}
              onClick={() => router.push('/admin/questions/nouvelle')}
            >
              Nouvelle question
            </Bouton>
          }
        />
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
                setRecherche('');
                setFormationId('toutes');
                setType('tous');
                setStatut('tout');
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
            {filtrees.map((question) => (
              <Carte
                key={question.id}
                rayon="var(--radius-md)"
                rembourrage="14px 20px"
                elevation="petite"
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}
              >
                <span style={{ width: 82, flex: 'none' }}>
                  <EtiquetteStatut ton={question.statut === 'publiee' ? 'publiee' : 'brouillon'}>
                    {LIBELLES_STATUT[question.statut] ?? question.statut}
                  </EtiquetteStatut>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
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
                  style={{
                    width: 64,
                    flex: 'none',
                    display: 'flex',
                    gap: 4,
                    justifyContent: 'flex-end',
                  }}
                >
                  <button
                    type="button"
                    aria-label="Modifier cette question"
                    onClick={() => router.push(`/admin/questions/${question.id}`)}
                    style={boutonLigne}
                  >
                    <Icone nom="pencil" taille={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Dupliquer cette question"
                    disabled={duplicationEnCours === question.id}
                    onClick={() => void dupliquer(question)}
                    style={boutonLigne}
                  >
                    <Icone nom="copy" taille={16} />
                  </button>
                </span>
              </Carte>
            ))}
          </div>
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
