'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  Bouton,
  Carte,
  Champ,
  EtiquetteStatut,
  Meta,
  Onglets,
  TitrePage,
} from '@/composants/ds/primitives';
import { Confirmation, EtatErreur, EtatVide, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { chargerFormations, identiteVisuelle, type Formation } from '@/lib/formations/depot';
import { echecDeLecture, type EchecDeLecture } from '@/lib/firebase/erreurs';

/**
 * 11 · Formations.
 *
 * **Écran en lecture seule.** Le référentiel appartient à Airtable ; rien ne
 * se crée ni ne se corrige ici. Une formation fausse se corrige dans Airtable,
 * puis se resynchronise. Le seul geste possible sur cet écran est de
 * déclencher cette synchronisation.
 */

type Rapport = {
  luesAirtable: number;
  creees: number;
  misesAJour: number;
  desactivees: number;
  rejetees: number;
  statutsAbsentsNombre?: number;
  ignoree?: boolean;
  motif?: string;
};

const ONGLETS = [
  { valeur: 'actives' as const, libelle: 'Au catalogue' },
  { valeur: 'inactives' as const, libelle: 'Hors catalogue' },
  { valeur: 'toutes' as const, libelle: 'Toutes' },
];

export default function PageFormations() {
  const [formations, setFormations] = useState<Formation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<EchecDeLecture>();
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<'actives' | 'inactives' | 'toutes'>('actives');

  const [synchronisation, setSynchronisation] = useState(false);
  const [rapport, setRapport] = useState<Rapport>();
  const [erreurSync, setErreurSync] = useState<string>();

  async function charger() {
    try {
      const liste = await chargerFormations();
      setFormations(liste);
      setErreur(undefined);
    } catch (probleme) {
      setErreur(echecDeLecture(probleme, 'le référentiel des formations'));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    let vivant = true;

    async function premierChargement() {
      try {
        const liste = await chargerFormations();
        if (vivant) setFormations(liste);
      } catch (probleme) {
        if (vivant) setErreur(echecDeLecture(probleme, 'le référentiel des formations'));
      } finally {
        if (vivant) setChargement(false);
      }
    }

    void premierChargement();
    return () => {
      vivant = false;
    };
  }, []);

  async function synchroniser() {
    setSynchronisation(true);
    setRapport(undefined);
    setErreurSync(undefined);

    try {
      const reponse = await fetch('/api/airtable/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forcer: false }),
      });
      const corps = (await reponse.json()) as Rapport & { erreur?: string };

      if (!reponse.ok) {
        setErreurSync(corps.erreur ?? "La synchronisation n'a pas abouti.");
        return;
      }

      setRapport(corps);
      await charger();
    } catch {
      setErreurSync(
        "La synchronisation n'a pas pu être lancée. Le référentiel n'a pas été modifié.",
      );
    } finally {
      setSynchronisation(false);
    }
  }

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return formations
      .filter((formation) => {
        if (filtre === 'actives' && !formation.actif) return false;
        if (filtre === 'inactives' && formation.actif) return false;
        if (terme.length === 0) return true;
        return (
          formation.nom.toLowerCase().includes(terme) ||
          formation.numeroActionDpc.toLowerCase().includes(terme) ||
          formation.cibles.some((cible) => cible.toLowerCase().includes(terme))
        );
      })
      .slice(0, 120);
  }, [formations, recherche, filtre]);

  const actives = formations.filter((formation) => formation.actif).length;

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
        titre="Formations"
        sous={
          chargement
            ? 'Lecture du référentiel.'
            : `${formations.length} formations, dont ${actives} au catalogue. Le référentiel vient d'Airtable : il se consulte ici, il se corrige là-bas.`
        }
        actions={
          <Bouton
            taille="lg"
            variante="secondaire"
            disabled={synchronisation}
            iconeGauche={<Icone nom="refresh" taille={16} />}
            onClick={() => void synchroniser()}
          >
            {synchronisation ? 'Synchronisation en cours…' : 'Synchroniser depuis Airtable'}
          </Bouton>
        }
      />

      {rapport && !rapport.ignoree && (
        <Confirmation>
          {rapport.luesAirtable} formations lues · {rapport.creees} créées ·{' '}
          {rapport.misesAJour} mises à jour · {rapport.desactivees} retirées du catalogue
          {rapport.rejetees > 0 ? ` · ${rapport.rejetees} rejetées` : ''}
          {rapport.statutsAbsentsNombre
            ? ` · ${rapport.statutsAbsentsNombre} sans statut dans Airtable`
            : ''}
        </Confirmation>
      )}

      {rapport?.ignoree && (
        <EtatVide
          icone="clock"
          titre="Synchronisation ignorée"
          texte={rapport.motif ?? 'Une synchronisation a eu lieu il y a moins de cinq minutes.'}
        />
      )}

      {erreurSync && (
        <EtatErreur
          titre="Synchronisation interrompue"
          texte={erreurSync}
          action={
            <Bouton
              variante="secondaire"
              iconeGauche={<Icone nom="refresh" taille={16} />}
              onClick={() => void synchroniser()}
            >
              Réessayer
            </Bouton>
          }
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Champ
          value={recherche}
          onChange={setRecherche}
          placeholder="Chercher par nom, numéro d'action ou public"
          prefixe={<Icone nom="search" taille={17} couleur="var(--neutral-50)" />}
          style={{ width: 380, flex: 'none' }}
        />
        <Onglets items={ONGLETS} valeur={filtre} onChange={setFiltre} />
        <span style={{ marginLeft: 'auto' }}>
          <Meta>
            {filtrees.length} affichée{filtrees.length > 1 ? 's' : ''}
            {filtrees.length === 120 ? ' — affinez la recherche pour voir les suivantes' : ''}
          </Meta>
        </span>
      </div>

      {erreur && (
        <EtatErreur
          titre="Lecture impossible"
          texte={erreur.texte}
          action={
            erreur.reessayable ? (
              <Bouton
                variante="secondaire"
                iconeGauche={<Icone nom="refresh" taille={16} />}
                onClick={() => {
                  setChargement(true);
                  void charger();
                }}
              >
                Réessayer
              </Bouton>
            ) : undefined
          }
        />
      )}

      {chargement && <Squelettes lignes={6} />}

      {!chargement && !erreur && formations.length === 0 && (
        <EtatVide
          icone="book"
          titre="Aucune formation au référentiel"
          texte="La synchronisation Airtable n'a jamais été lancée, ou n'a rien rapporté. Lancez-la pour remplir le catalogue."
          actions={
            <Bouton
              iconeGauche={<Icone nom="refresh" taille={16} />}
              onClick={() => void synchroniser()}
            >
              Synchroniser
            </Bouton>
          }
        />
      )}

      {!chargement && formations.length > 0 && filtrees.length === 0 && (
        <EtatVide
          icone="search"
          titre="Aucune formation ne correspond"
          texte="Élargissez la recherche, ou changez de filtre."
        />
      )}

      {!chargement && filtrees.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {filtrees.map((formation) => {
            const identite = identiteVisuelle(formation);
            return (
              <Carte
                key={formation.id}
                rayon="var(--radius-xl)"
                rembourrage="20px 22px"
                style={{ opacity: formation.actif ? 1 : 0.72 }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 'var(--space-3)',
                  }}
                >
                  {/* La forme identifie la formation : c'est le repère du
                      système. SVG local de 300 octets, servi tel quel :
                      `next/image` n'a rien à y optimiser. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/formes/${identite.fichier}`}
                    alt=""
                    width={34}
                    height={34}
                    style={{ objectFit: 'contain', flex: 'none' }}
                  />
                  {!formation.actif && <EtiquetteStatut ton="attention">Hors catalogue</EtiquetteStatut>}
                </span>

                <span
                  style={{
                    display: 'block',
                    marginTop: 14,
                    fontSize: 'var(--heading-sm-size)',
                    fontWeight: 600,
                    lineHeight: 1.3,
                    color: 'var(--text-heading)',
                    textWrap: 'pretty',
                  }}
                >
                  {formation.nom}
                </span>

                <span
                  style={{
                    display: 'block',
                    marginTop: 6,
                    fontSize: 'var(--body-sm-size)',
                    color: 'var(--neutral-60)',
                  }}
                >
                  {formation.cibles.length > 0 ? formation.cibles.join(', ') : 'Public non renseigné'}
                </span>

                <div
                  style={{
                    marginTop: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-4)',
                    flexWrap: 'wrap',
                  }}
                >
                  <Meta style={{ fontSize: 12 }}>N° {formation.numeroActionDpc || '—'}</Meta>
                  {formation.format && <Meta style={{ fontSize: 12 }}>{formation.format}</Meta>}
                  {formation.dureeTotale && (
                    <Meta style={{ fontSize: 12 }}>{formation.dureeTotale} h</Meta>
                  )}
                  {formation.urlWebflow && (
                    <a
                      href={formation.urlWebflow}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 'var(--body-sm-size)', marginLeft: 'auto' }}
                    >
                      Fiche publique
                    </a>
                  )}
                </div>
              </Carte>
            );
          })}
        </div>
      )}
    </div>
  );
}
