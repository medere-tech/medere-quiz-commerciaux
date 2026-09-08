'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

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
import {
  chargerDernierRapport,
  chargerPageFormations,
  chargerToutesLesFormations,
  compterFormations,
  type FiltreFormations,
  identiteVisuelle,
  type Formation,
  type RapportSynchronisation,
} from '@/lib/formations/depot';
import { echecDeLecture, type EchecDeLecture } from '@/lib/firebase/erreurs';
import { entierBorne, useParametresUrl } from '@/lib/navigation/parametres-url';
import { ChargerPlus } from '@/composants/admin/ChargerPlus';

/**
 * 11 · Formations.
 *
 * **Écran en lecture seule.** Le référentiel appartient à Airtable ; rien ne
 * se crée ni ne se corrige ici. Une formation fausse se corrige dans Airtable,
 * puis se resynchronise. Le seul geste possible sur cet écran est de
 * déclencher cette synchronisation.
 */

/**
 * Réponse de la route de synchronisation. Elle porte le détail complet, là
 * où le document Firestore relu au chargement borne ses listes.
 */
type Rapport = {
  luesAirtable: number;
  creees: number;
  misesAJour: number;
  desactivees: number;
  rejetees: number;
  rejets?: RapportSynchronisation['rejets'];
  statutsInconnus?: string[];
  statutsAbsentsNombre?: number;
  statutsAbsents?: string[];
  ignoree?: boolean;
  motif?: string;
};

/**
 * Ce qu'Airtable a renvoyé mais qui n'est pas au catalogue.
 *
 * Trois causes distinctes, à ne pas mélanger : un enregistrement rejeté
 * n'existe pas en base, une formation sans statut y est mais hors catalogue,
 * un statut non reconnu vaut hors catalogue par défaut. Les trois se
 * corrigent dans Airtable, et aucune ne se voit ailleurs qu'ici.
 */
type Ecarts = {
  rejetees: number;
  rejets: RapportSynchronisation['rejets'];
  statutsInconnus: string[];
  statutsAbsentsNombre: number;
  statutsAbsents: string[];
};

function ecartsDe(rapport: {
  rejetees: number;
  rejets?: RapportSynchronisation['rejets'];
  statutsInconnus?: string[];
  statutsAbsentsNombre?: number;
  statutsAbsents?: string[];
}): Ecarts {
  return {
    rejetees: rapport.rejetees,
    rejets: rapport.rejets ?? [],
    statutsInconnus: rapport.statutsInconnus ?? [],
    statutsAbsentsNombre: rapport.statutsAbsentsNombre ?? 0,
    statutsAbsents: rapport.statutsAbsents ?? [],
  };
}

/** Combien de formations de plus à chaque « voir plus ». */
const PAR_PAGE = 60;

/**
 * L'état de la liste vit dans l'URL, comme celui de la banque : on revient
 * d'une recherche sans la refaire, et un lien désigne une vue précise.
 */
const DEFAUTS = {
  q: '',
  filtre: 'actives',
  vus: String(PAR_PAGE),
};

const ONGLETS = [
  { valeur: 'actives' as const, libelle: 'Au catalogue' },
  { valeur: 'inactives' as const, libelle: 'Hors catalogue' },
  { valeur: 'toutes' as const, libelle: 'Toutes' },
];

/**
 * Ce qu'Airtable a renvoyé et qui n'est pas arrivé au catalogue.
 *
 * Le compte rendu annonçait « 1 rejetée » sans dire laquelle. Un problème
 * signalé sans sa cause n'est pas signalé, il est seulement inquiétant : le
 * détail existait déjà en base, il manquait à l'écran.
 *
 * Trois listes plutôt qu'une, parce que le geste de correction diffère. Un
 * rejet demande de remplir un champ manquant, un statut vide demande de
 * choisir « Active » ou non, un statut non reconnu demande de corriger une
 * valeur. Les fondre ensemble ferait chercher trois fois.
 */
function Ecartes({ ecarts, formations }: { ecarts: Ecarts; formations: Formation[] }) {
  // Le document Firestore d'une formation porte son identifiant Airtable :
  // une formation sans statut est en base, on peut donc la nommer. Un
  // enregistrement rejeté, lui, n'y est jamais entré.
  const nomDe = (airtableId: string) =>
    formations.find((formation) => formation.id === airtableId)?.nom ?? '';

  const rien =
    ecarts.rejetees === 0 &&
    ecarts.statutsAbsentsNombre === 0 &&
    ecarts.statutsInconnus.length === 0;

  if (rien) return null;

  const pluriel = (nombre: number) => (nombre > 1 ? 's' : '');

  return (
    <Carte rembourrage="24px 26px">
      <div style={{ display: 'flex', gap: 'var(--space-5)', alignItems: 'flex-start' }}>
        <span
          style={{
            width: 44,
            height: 44,
            flex: 'none',
            borderRadius: 999,
            background: 'var(--surface-page)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icone nom="alert" taille={22} couleur="var(--neutral-70)" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              lineHeight: 1.2,
              color: 'var(--text-heading)',
            }}
          >
            Écarté du catalogue à la dernière synchronisation
          </span>
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 'var(--body-sm-size)',
              lineHeight: 1.55,
              color: 'var(--neutral-70)',
              textWrap: 'pretty',
            }}
          >
            {"Ces enregistrements ne sont pas proposés aux commerciaux. Corrigez-les dans Airtable, puis relancez la synchronisation : ils reviendront d'eux-mêmes."}
          </p>

          {ecarts.rejetees > 0 && (
            <Groupe
              titre={`${ecarts.rejetees} enregistrement${pluriel(ecarts.rejetees)} rejeté${pluriel(ecarts.rejetees)}`}
              aide="Un champ obligatoire manque : ces enregistrements ne sont pas entrés en base."
              montres={ecarts.rejets.length}
              total={ecarts.rejetees}
            >
              {ecarts.rejets.map((rejet) => (
                <Ligne
                  key={rejet.airtableId}
                  titre={rejet.nom.trim() || 'Enregistrement sans nom'}
                  identifiant={rejet.airtableId}
                  detail={rejet.raisons.join(' · ')}
                />
              ))}
            </Groupe>
          )}

          {ecarts.statutsAbsentsNombre > 0 && (
            <Groupe
              titre={`${ecarts.statutsAbsentsNombre} formation${pluriel(ecarts.statutsAbsentsNombre)} sans statut`}
              aide="La case « Statut » est vide dans Airtable, et tout ce qui n'est pas « Active » reste hors catalogue."
              montres={ecarts.statutsAbsents.length}
              total={ecarts.statutsAbsentsNombre}
            >
              {ecarts.statutsAbsents.map((airtableId) => (
                <Ligne
                  key={airtableId}
                  titre={nomDe(airtableId) || 'Formation sans nom'}
                  identifiant={airtableId}
                />
              ))}
            </Groupe>
          )}

          {ecarts.statutsInconnus.length > 0 && (
            <Groupe
              titre={`${ecarts.statutsInconnus.length} statut${pluriel(ecarts.statutsInconnus.length)} non reconnu${pluriel(ecarts.statutsInconnus.length)}`}
              aide="Ces valeurs ne figurent pas au contrat : les formations qui les portent restent hors catalogue."
              montres={ecarts.statutsInconnus.length}
              total={ecarts.statutsInconnus.length}
            >
              {ecarts.statutsInconnus.map((statut) => (
                <Ligne
                  key={statut}
                  titre={statut}
                  detail="Valeur attendue : « Active », ou une autre valeur du contrat."
                />
              ))}
            </Groupe>
          )}
        </div>
      </div>
    </Carte>
  );
}

function Groupe({
  titre,
  aide,
  montres,
  total,
  children,
}: {
  titre: string;
  aide: string;
  montres: number;
  total: number;
  children: ReactNode;
}) {
  return (
    <section style={{ marginTop: 'var(--space-5)' }}>
      <span
        style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 'var(--body-md-size)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-heading)',
          }}
        >
          {titre}
        </h3>
        <Meta style={{ fontSize: 12 }}>{aide}</Meta>
      </span>

      <ul
        style={{
          listStyle: 'none',
          margin: '10px 0 0',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {children}
      </ul>

      {montres < total && (
        <Meta style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          {montres} sur {total} affichés. Le compte rendu ne conserve que les premiers : relancez
          la synchronisation après correction pour voir les suivants.
        </Meta>
      )}
    </section>
  );
}

/**
 * Une ligne se distingue par son fond, jamais par un filet sous la précédente.
 *
 * Tout coule de gauche à droite. Pousser le motif à l'extrémité droite le
 * renvoyait seul à la ligne dès qu'un nom de formation était long, aligné à
 * droite sous un grand vide.
 */
function Ligne({
  titre,
  identifiant,
  detail,
}: {
  titre: string;
  identifiant?: string;
  detail?: string;
}) {
  return (
    <li
      style={{
        background: 'var(--surface-page)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 13px',
        display: 'flex',
        alignItems: 'baseline',
        gap: 'var(--space-3)',
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          fontSize: 'var(--body-sm-size)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-heading)',
        }}
      >
        {titre}
      </span>
      {identifiant && (
        <Meta style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{identifiant}</Meta>
      )}
      {detail && <Meta style={{ fontSize: 12 }}>{detail}</Meta>}
    </li>
  );
}

export default function PageFormations() {
  const [formations, setFormations] = useState<Formation[]>([]);
  /** Totaux exacts, obtenus par agrégat sans lire les documents. */
  const [total, setTotal] = useState(0);
  const [totalActives, setTotalActives] = useState(0);
  const [totalFiltre, setTotalFiltre] = useState(0);
  const [chargementSuite, setChargementSuite] = useState(false);
  const curseur = useRef<QueryDocumentSnapshot | null>(null);
  const [rechargements, setRechargements] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<EchecDeLecture>();
  const { valeurs, definir } = useParametresUrl(DEFAUTS);
  const recherche = valeurs.q;
  const filtre = valeurs.filtre as 'actives' | 'inactives' | 'toutes';
  const vus = entierBorne(valeurs.vus, PAR_PAGE, 1);

  /** Chercher ou changer de filtre repose la question : on repart du haut. */
  const filtrer = (modifications: Partial<typeof DEFAUTS>) =>
    definir({ ...modifications, vus: String(PAR_PAGE) });

  const [synchronisation, setSynchronisation] = useState(false);
  const [rapport, setRapport] = useState<Rapport>();
  const [ecarts, setEcarts] = useState<Ecarts>();
  const [erreurSync, setErreurSync] = useState<string>();

  function charger() {
    setRechargements((precedents) => precedents + 1);
  }

  /** Une recherche porte sur l'ensemble filtré, pas sur la page affichée. */
  const enRecherche = recherche.trim().length > 0;

  const cle = `${filtre}|${enRecherche}|${rechargements}`;

  useEffect(() => {
    let vivant = true;

    async function premierChargement() {
      setChargement(true);
      curseur.current = null;

      try {
        const [compteTotal, compteActives, compteFiltre] = await Promise.all([
          compterFormations('toutes'),
          compterFormations('actives'),
          compterFormations(filtre as FiltreFormations),
        ]);
        if (!vivant) return;
        setTotal(compteTotal);
        setTotalActives(compteActives);
        setTotalFiltre(compteFiltre);

        if (enRecherche) {
          // Firestore ne cherche ni dans un nom ni dans une liste de cibles :
          // la recherche s'applique à l'ensemble que le filtre a réduit.
          const toutes = await chargerToutesLesFormations(filtre as FiltreFormations);
          if (!vivant) return;
          setFormations(toutes);
        } else {
          const cumul: Formation[] = [];
          let suivant: QueryDocumentSnapshot | null = null;
          let reste = true;

          while (reste && cumul.length < Math.max(vus, PAR_PAGE)) {
            const page = await chargerPageFormations(
              filtre as FiltreFormations,
              PAR_PAGE,
              suivant,
            );
            if (!vivant) return;
            cumul.push(...page.formations);
            suivant = page.curseur;
            reste = page.encore;
          }

          setFormations(cumul);
          curseur.current = suivant;
        }
        setErreur(undefined);
      } catch (probleme) {
        if (!vivant) return;
        // Même raison qu'à la banque : une liste périmée sous un filtre en
        // échec se lit comme un filtre appliqué.
        setFormations([]);
        setErreur(echecDeLecture(probleme, 'le référentiel des formations'));
      } finally {
        if (vivant) setChargement(false);
      }
    }

    // Le compte rendu est un complément, pas le contenu de l'écran : s'il
    // manque, les formations s'affichent quand même. Quand c'est la base
    // entière qui refuse, l'erreur de la lecture ci-dessus le dit déjà.
    async function dernierRapport() {
      try {
        const releve = await chargerDernierRapport();
        if (vivant && releve) setEcarts(ecartsDe(releve));
      } catch (probleme) {
        console.error('Compte rendu de synchronisation illisible', probleme);
      }
    }

    void premierChargement();
    void dernierRapport();
    return () => {
      vivant = false;
    };
    // `cle` résume le filtre, la recherche et les rechargements demandés.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  async function pageSuivante() {
    if (chargementSuite || !curseur.current) return;
    setChargementSuite(true);
    try {
      const page = await chargerPageFormations(
        filtre as FiltreFormations,
        PAR_PAGE,
        curseur.current,
      );
      setFormations((precedentes) => [...precedentes, ...page.formations]);
      curseur.current = page.curseur;
    } catch (probleme) {
      setErreur(echecDeLecture(probleme, 'le référentiel des formations'));
    } finally {
      setChargementSuite(false);
    }
  }

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
      // La réponse de la route n'est pas bornée : elle remplace un relevé
      // relu en base, qui l'est.
      if (!corps.ignoree) setEcarts(ecartsDe(corps));
      await charger();
    } catch {
      setErreurSync(
        "La synchronisation n'a pas pu être lancée. Le référentiel n'a pas été modifié.",
      );
    } finally {
      setSynchronisation(false);
    }
  }

  /**
   * Le filtre « au catalogue » est déjà appliqué par Firestore. Il ne reste
   * ici que la recherche plein texte, que Firestore ne sait pas faire — ni
   * sous-chaîne, ni recherche dans une liste de cibles.
   */
  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    if (terme.length === 0) return formations;

    return formations.filter(
      (formation) =>
        formation.nom.toLowerCase().includes(terme) ||
        formation.numeroActionDpc.toLowerCase().includes(terme) ||
        formation.cibles.some((cible) => cible.toLowerCase().includes(terme)),
    );
  }, [formations, recherche]);

  // Le plafond n'est plus une coupe sèche : il se relève à la demande, et le
  // pied de liste dit toujours combien de formations restent derrière.
  const visibles = enRecherche ? filtrees : filtrees.slice(0, vus);

  const actives = totalActives;

  return (
    <div className="page-admin">
      <TitrePage
        titre="Formations"
        sous={
          chargement
            ? 'Lecture du référentiel.'
            : `${total} formations, dont ${actives} au catalogue. Le référentiel vient d'Airtable : il se consulte ici, il se corrige là-bas.`
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

      {ecarts && <Ecartes ecarts={ecarts} formations={formations} />}

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
          onChange={(valeur) => filtrer({ q: valeur })}
          placeholder="Chercher par nom, numéro d'action ou public"
          prefixe={<Icone nom="search" taille={17} couleur="var(--neutral-50)" />}
          style={{ flex: '1 1 260px', minWidth: 0, maxWidth: 380 }}
        />
        <Onglets items={ONGLETS} valeur={filtre} onChange={(valeur) => filtrer({ filtre: valeur })} />
        <span style={{ marginLeft: 'auto' }}>
          <Meta>
            {enRecherche
              ? `${filtrees.length} résultat${filtrees.length > 1 ? 's' : ''} sur ${formations.length}`
              : `${visibles.length} formation${visibles.length > 1 ? 's' : ''} sur ${totalFiltre}`}
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

      {!chargement && !erreur && total === 0 && (
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {visibles.map((formation) => {
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

      {!chargement && (
        <ChargerPlus
          affichees={visibles.length}
          total={enRecherche ? filtrees.length : totalFiltre}
          parPage={PAR_PAGE}
          nom="formations"
          onPlus={() => {
            definir({ vus: String(vus + PAR_PAGE) });
            void pageSuivante();
          }}
        />
      )}
    </div>
  );
}
