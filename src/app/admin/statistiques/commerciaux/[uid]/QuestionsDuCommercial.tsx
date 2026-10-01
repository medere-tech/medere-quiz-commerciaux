'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useMemo } from 'react';

import { ChargerPlus } from '@/composants/admin/ChargerPlus';
import { EtatVide } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { FormeFormation } from '@/composants/ds/parcours';
import { EtiquetteStatut, Meta, Onglets, Selecteur } from '@/composants/ds/primitives';
import { entierBorne, useParametresUrl } from '@/lib/navigation/parametres-url';

/**
 * Les questions servies à un commercial, et où il en est sur chacune.
 *
 * Trois états, ceux de sa maîtrise : **ratée** (la dernière tentative est un
 * échec — ce qu'« À revoir » lui propose), **jamais vue**, **acquise** (la
 * dernière tentative est juste). Chaque ligne ouvre la question et ses
 * résultats pour toute l'équipe.
 *
 * Filtre, tri et nombre de lignes vivent dans l'adresse, par
 * `useParametresUrl` : la page ne lit pas `searchParams` côté serveur, un choix
 * ne relance donc aucun rendu serveur.
 */

export type EtatLigne = 'ratee' | 'jamais' | 'acquise';

export type LigneSuivie = {
  questionId: string;
  enonce: string;
  formationId: string | null;
  formationNom: string;
  formationFichier: string | null;
  tentatives: number;
  reussies: number;
  etat: EtatLigne;
  vueLeMs: number | null;
};

type Filtre = 'toutes' | EtatLigne;
type Tri = 'formation' | 'ratees' | 'recentes';

const PAR_PAGE = 20;
const DEFAUTS = { filtre: 'toutes', tri: 'formation', vus: String(PAR_PAGE) };

const ORDRE_ETAT: Record<EtatLigne, number> = { ratee: 0, jamais: 1, acquise: 2 };

const TRIS: { valeur: Tri; libelle: string }[] = [
  { valeur: 'formation', libelle: 'Formation la plus faible' },
  { valeur: 'ratees', libelle: 'Les plus ratées' },
  { valeur: 'recentes', libelle: 'Vues récemment' },
];

const JOUR = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Paris',
});

const ETIQUETTES: Record<EtatLigne, { libelle: string; ton: 'erreur' | 'brouillon' | 'publiee' }> = {
  ratee: { libelle: 'Ratée', ton: 'erreur' },
  jamais: { libelle: 'Jamais vue', ton: 'brouillon' },
  acquise: { libelle: 'Acquise', ton: 'publiee' },
};

/** Ce que la ligne dit de l'historique, avec les seuls compteurs que tient l'état. */
function detail(ligne: LigneSuivie): string {
  const date = ligne.vueLeMs === null ? null : JOUR.format(new Date(ligne.vueLeMs));
  if (ligne.etat === 'jamais') return 'Jamais servie à ce commercial';

  if (ligne.etat === 'ratee') {
    const echecs = ligne.tentatives - ligne.reussies;
    if (echecs <= 1) return date ? `Ratée 1 fois, le ${date}` : 'Ratée 1 fois';
    return date ? `Ratée ${echecs} fois, dernière le ${date}` : `Ratée ${echecs} fois`;
  }

  if (ligne.tentatives === 1) return date ? `Juste du premier coup, le ${date}` : 'Juste du premier coup';
  const juste = `Juste ${ligne.reussies} fois sur ${ligne.tentatives}`;
  return date ? `${juste}, dernière le ${date}` : juste;
}

export function QuestionsDuCommercial({
  lignes,
  ordreFormations,
}: {
  lignes: LigneSuivie[];
  /** Les formations de la plus faible à la plus forte, pour le tri par défaut. */
  ordreFormations: string[];
}) {
  const { valeurs, definir } = useParametresUrl(DEFAUTS);
  const filtre: Filtre = (['toutes', 'ratee', 'jamais', 'acquise'] as const).includes(valeurs.filtre as Filtre)
    ? (valeurs.filtre as Filtre)
    : 'toutes';
  const tri: Tri = TRIS.some((option) => option.valeur === valeurs.tri) ? (valeurs.tri as Tri) : 'formation';
  const vus = entierBorne(valeurs.vus, PAR_PAGE, 1);

  const comptes = useMemo(() => {
    const parEtat = { ratee: 0, jamais: 0, acquise: 0 };
    for (const ligne of lignes) parEtat[ligne.etat] += 1;
    return parEtat;
  }, [lignes]);

  const triees = useMemo(() => {
    const rang = new Map(ordreFormations.map((id, index) => [id, index]));
    const rangFormation = (ligne: LigneSuivie) =>
      ligne.formationId !== null ? (rang.get(ligne.formationId) ?? ordreFormations.length) : ordreFormations.length;

    const retenues = filtre === 'toutes' ? lignes : lignes.filter((ligne) => ligne.etat === filtre);
    return [...retenues].sort((a, b) => {
      if (tri === 'ratees') {
        const ecart = b.tentatives - b.reussies - (a.tentatives - a.reussies);
        return ecart !== 0 ? ecart : ORDRE_ETAT[a.etat] - ORDRE_ETAT[b.etat];
      }
      if (tri === 'recentes') return (b.vueLeMs ?? -1) - (a.vueLeMs ?? -1);
      const ecart = rangFormation(a) - rangFormation(b);
      return ecart !== 0 ? ecart : ORDRE_ETAT[a.etat] - ORDRE_ETAT[b.etat];
    });
  }, [lignes, ordreFormations, filtre, tri]);

  const visibles = triees.slice(0, vus);
  const choisir = (valeur: Filtre) => definir({ filtre: valeur, vus: String(PAR_PAGE) });

  return (
    <>
      <div className="suivi-filtres">
        <div className="suivi-pas-etroit">
          <Onglets
            libelle="Filtrer les questions"
            items={[
              { valeur: 'toutes', libelle: `Toutes ${lignes.length}` },
              { valeur: 'ratee', libelle: `Ratées ${comptes.ratee}` },
              { valeur: 'jamais', libelle: `Jamais vues ${comptes.jamais}` },
              { valeur: 'acquise', libelle: `Acquises ${comptes.acquise}` },
            ]}
            valeur={filtre}
            onChange={choisir}
          />
        </div>
        {/* Sur téléphone, la maquette retire « Acquises » et le compte de
            « Toutes » : trois onglets tiennent sur une ligne, quatre non. */}
        <div className="suivi-etroit">
          <Onglets
            libelle="Filtrer les questions"
            items={[
              { valeur: 'toutes', libelle: 'Toutes' },
              { valeur: 'ratee', libelle: `Ratées ${comptes.ratee}` },
              { valeur: 'jamais', libelle: `Jamais vues ${comptes.jamais}` },
            ]}
            valeur={filtre === 'acquise' ? 'toutes' : filtre}
            onChange={choisir}
          />
        </div>
        <span className="suivi-tri suivi-pas-etroit">
          <Meta style={{ fontSize: 13 }}>Trier par</Meta>
          <Selecteur
            options={TRIS}
            value={tri}
            onChange={(valeur) => definir({ tri: valeur, vus: String(PAR_PAGE) })}
            style={{ width: 'var(--suivi-tri-largeur)' }}
          />
        </span>
      </div>

      {visibles.length === 0 ? (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <EtatVide
            icone={filtre === 'ratee' ? 'check' : 'layers'}
            titre={
              lignes.length === 0
                ? 'Aucune question servie'
                : filtre === 'ratee'
                  ? 'Aucune question à revoir'
                  : filtre === 'jamais'
                    ? 'Toutes les questions ont été vues'
                    : 'Aucune question acquise pour l’instant'
            }
            texte={
              lignes.length === 0
                ? 'Publiez des questions pour ouvrir l’entraînement : elles apparaîtront ici.'
                : filtre === 'ratee'
                  ? 'Sa dernière tentative est juste sur chaque question qu’il a vue.'
                  : filtre === 'jamais'
                    ? 'Le tirage lui a déjà servi chaque question publiée.'
                    : 'Une question est acquise quand sa dernière tentative est juste.'
            }
          />
        </div>
      ) : (
        <div className="suivi-lignes">
          {visibles.map((ligne) => (
            <Ligne key={ligne.questionId} ligne={ligne} />
          ))}
        </div>
      )}

      <ChargerPlus
        affichees={visibles.length}
        total={triees.length}
        parPage={PAR_PAGE}
        nom="questions"
        onPlus={() => definir({ vus: String(vus + PAR_PAGE) })}
      />
    </>
  );
}

function Ligne({ ligne }: { ligne: LigneSuivie }) {
  const texte = detail(ligne);
  const etiquette = ETIQUETTES[ligne.etat];

  return (
    <Link
      href={`/admin/statistiques/${ligne.questionId}` as Route}
      className={`ligne-suivie${ligne.etat === 'ratee' ? ' ligne-suivie--ratee' : ''}`}
    >
      <span className={`marque-etat marque-etat--${ligne.etat}`} aria-hidden="true">
        {ligne.etat !== 'jamais' && (
          <Icone nom={ligne.etat === 'ratee' ? 'close' : 'check'} taille={14} epaisseur={2.3} />
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="ligne-suivie-enonce">{ligne.enonce}</span>
        {ligne.formationNom && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, minWidth: 0 }}>
            {ligne.formationFichier && <FormeFormation fichier={ligne.formationFichier} taille={16} />}
            <span
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {ligne.formationNom}
            </span>
          </span>
        )}
        {/* Sur téléphone, l'état se lit à la pastille et au détail : la colonne
            de droite de la maquette bureau n'y est pas dessinée. */}
        <span className={`suivi-etroit ligne-suivie-detail ligne-suivie-detail--${ligne.etat}`}>
          <span className="visuellement-cache">{etiquette.libelle}. </span>
          {texte}
        </span>
      </span>
      <span className="ligne-suivie-droite suivi-pas-etroit">
        <EtiquetteStatut ton={etiquette.ton}>{etiquette.libelle}</EtiquetteStatut>
        <span className={`ligne-suivie-detail ligne-suivie-detail--${ligne.etat}`}>{texte}</span>
      </span>
    </Link>
  );
}
