'use client';

import { useMemo, useState } from 'react';

import { Champ, Etiquette, EtiquetteStatut, Meta } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import type { Formation } from '@/lib/formations/depot';

/**
 * Rattachement d'une question à ses formations.
 *
 * Le référentiel compte 171 formations, dont 159 actives : une liste
 * déroulante native est inutilisable à cette taille — on ne retrouve pas une
 * formation dans 159 lignes sans la chercher. La saisie filtre sur le nom et
 * sur le numéro d'action DPC, et n'affiche que les premiers résultats.
 *
 * Une formation devenue inactive reste affichée si la question lui est déjà
 * rattachée : la masquer ferait disparaître le lien sans que personne ne s'en
 * aperçoive. Elle porte alors une étiquette.
 */

const RESULTATS_AFFICHES = 8;

export function SelecteurFormations({
  formations,
  selection,
  onChange,
  erreur,
}: {
  formations: Formation[];
  selection: string[];
  onChange: (identifiants: string[]) => void;
  erreur?: string;
}) {
  const [recherche, setRecherche] = useState('');

  const parIdentifiant = useMemo(
    () => new Map(formations.map((formation) => [formation.id, formation])),
    [formations],
  );

  const resultats = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    if (terme.length === 0) return [];

    return formations
      .filter((formation) => !selection.includes(formation.id))
      .filter(
        (formation) =>
          formation.nom.toLowerCase().includes(terme) ||
          formation.numeroActionDpc.toLowerCase().includes(terme),
      )
      .slice(0, RESULTATS_AFFICHES);
  }, [formations, recherche, selection]);

  const actives = formations.filter((formation) => formation.actif).length;

  return (
    <div>
      <span
        style={{
          display: 'block',
          fontSize: 'var(--body-sm-size)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-heading)',
          marginBottom: 'var(--space-2)',
        }}
      >
        Formations rattachées
      </span>

      {selection.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 'var(--space-3)',
          }}
        >
          {selection.map((identifiant) => {
            const formation = parIdentifiant.get(identifiant);
            return (
              <span
                key={identifiant}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 8px 7px 12px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--surface-chip)',
                  fontSize: 'var(--body-sm-size)',
                  color: 'var(--text-heading)',
                  maxWidth: '100%',
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 320,
                  }}
                >
                  {formation ? formation.nom : identifiant}
                </span>
                {formation && !formation.actif && (
                  <EtiquetteStatut ton="attention">Inactive</EtiquetteStatut>
                )}
                {!formation && <EtiquetteStatut ton="erreur">Introuvable</EtiquetteStatut>}
                <button
                  type="button"
                  aria-label={`Retirer ${formation?.nom ?? identifiant}`}
                  onClick={() =>
                    onChange(selection.filter((autre) => autre !== identifiant))
                  }
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                    color: 'var(--neutral-60)',
                  }}
                >
                  <Icone nom="close" taille={14} epaisseur={2} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <Champ
        value={recherche}
        onChange={setRecherche}
        placeholder="Chercher une formation par son nom ou son numéro d'action"
        prefixe={<Icone nom="search" taille={17} couleur="var(--neutral-50)" />}
        erreur={erreur}
        aide={
          erreur
            ? undefined
            : `${actives} formations actives au catalogue. Une question peut en couvrir plusieurs.`
        }
      />

      {recherche.trim().length > 0 && (
        <div
          style={{
            marginTop: 'var(--space-2)',
            background: 'var(--surface-card)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-card-sm)',
            overflow: 'hidden',
          }}
        >
          {resultats.length === 0 ? (
            <div style={{ padding: '14px 16px' }}>
              <Meta>Aucune formation ne correspond à cette recherche.</Meta>
            </div>
          ) : (
            resultats.map((formation) => (
              <button
                key={formation.id}
                type="button"
                onClick={() => {
                  onChange([...selection, formation.id]);
                  setRecherche('');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  padding: '11px 16px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 'var(--body-sm-size)',
                      color: 'var(--text-body)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formation.nom}
                  </span>
                  <Meta style={{ fontSize: 12 }}>
                    {formation.numeroActionDpc}
                    {formation.cibles.length > 0 ? ` · ${formation.cibles.join(', ')}` : ''}
                  </Meta>
                </span>
                {!formation.actif && <Etiquette>Inactive</Etiquette>}
                <Icone nom="plus" taille={16} couleur="var(--neutral-50)" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
