'use client';

import { useEffect, useMemo, useState } from 'react';
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
  TitreSection,
  ZoneDeTexte,
} from '@/composants/ds/primitives';
import { Confirmation, EtatErreur, EtatVide, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { chargerFormations, type Formation } from '@/lib/formations/depot';
import { echecDeLecture, type EchecDeLecture } from '@/lib/firebase/erreurs';
import { authentification } from '@/lib/firebase/client';
import { creerQuestion } from '@/lib/questions/depot';
import { LIBELLES_DIFFICULTE, DIFFICULTES } from '@/lib/questions/modele';
import { ENTETE_MODELE, LIBELLES_COLONNE, type Colonne } from '@/lib/import/colonnes';
import { lireCollage, type ResultatCollage } from '@/lib/import/collage';
import {
  analyserLigne,
  indexerFormations,
  FORMATS_PROPOSES,
  SEPARATEUR_VALEURS,
  type ErreurLigne,
  type LigneAnalysee,
  type LigneImport,
} from '@/lib/import/lignes';

/**
 * 08 · Import en masse.
 *
 * **La fonction qui décide de l'adoption.** Noémie écrit ses questions en lot
 * avec une IA ; elle n'en saisira jamais deux cents une par une. Si l'import
 * est pénible, le reste du back-office ne sert à rien.
 *
 * Trois principes tiennent l'écran :
 *
 * 1. **Aucun échec en bloc.** Une ligne fautive ne retient pas les autres.
 *    Le seul refus global est un en-tête illisible, où il n'y a rien à sauver.
 * 2. **Une erreur se corrige là où elle s'affiche.** La prévisualisation est
 *    modifiable : renvoyer Noémie dans son tableur pour une formation mal
 *    orthographiée, c'est lui faire refaire le collage entier.
 * 3. **Tout arrive en brouillon.** Un lot produit par une IA se relit.
 */

type Filtre = 'toutes' | 'pretes' | 'erreur';

const FILTRES: { valeur: Filtre; libelle: string }[] = [
  { valeur: 'toutes', libelle: 'Toutes' },
  { valeur: 'pretes', libelle: 'Prêtes' },
  { valeur: 'erreur', libelle: 'En erreur' },
];

type Rapport = { ecrites: number; echouees: { numero: number; message: string }[] };

export default function PageImport() {
  const router = useRouter();

  const [formations, setFormations] = useState<Formation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState<EchecDeLecture>();

  const [colle, setColle] = useState('');
  const [collage, setCollage] = useState<ResultatCollage>({ etat: 'vide' });
  const [lignes, setLignes] = useState<LigneImport[]>([]);
  const [importees, setImportees] = useState<number[]>([]);

  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [importEnCours, setImportEnCours] = useState(false);
  const [progression, setProgression] = useState(0);
  const [rapport, setRapport] = useState<Rapport>();
  const [erreurImport, setErreurImport] = useState<string>();

  useEffect(() => {
    let vivant = true;

    async function charger() {
      try {
        const liste = await chargerFormations();
        if (vivant) setFormations(liste);
      } catch (probleme) {
        if (vivant) setErreurChargement(echecDeLecture(probleme, 'le référentiel des formations'));
      } finally {
        if (vivant) setChargement(false);
      }
    }

    void charger();
    return () => {
      vivant = false;
    };
  }, []);

  /**
   * Le collage refait les lignes de zéro : c'est un nouveau lot, les
   * corrections du précédent n'ont plus d'objet. Fait à la frappe et non dans
   * un effet — l'analyse est une conséquence directe du geste, pas une
   * synchronisation avec un système extérieur.
   */
  function coller(texte: string) {
    const resultat = lireCollage(texte);
    setColle(texte);
    setCollage(resultat);
    setLignes(resultat.etat === 'lu' ? resultat.lignes : []);
    setImportees([]);
    setRapport(undefined);
    setErreurImport(undefined);
  }

  const index = useMemo(() => indexerFormations(formations), [formations]);

  const analyses = useMemo(
    () => lignes.map((ligne) => analyserLigne(ligne, index)),
    [lignes, index],
  );

  const dejaEcrite = (numero: number) => importees.includes(numero);

  const pretes = analyses.filter(
    (analyse) => analyse.question !== null && !dejaEcrite(analyse.ligne.numero),
  );
  const enErreur = analyses.filter((analyse) => analyse.erreurs.length > 0);

  const affichees = analyses.filter((analyse) => {
    if (filtre === 'pretes') return analyse.question !== null;
    if (filtre === 'erreur') return analyse.erreurs.length > 0;
    return true;
  });

  /** Une correction remplace une cellule, puis toute la ligne est réanalysée. */
  function corriger(numero: number, colonne: Colonne, valeur: string) {
    setLignes((precedentes) =>
      precedentes.map((ligne) =>
        ligne.numero === numero
          ? { ...ligne, valeurs: { ...ligne.valeurs, [colonne]: valeur } }
          : ligne,
      ),
    );
  }

  async function importer() {
    const utilisateur = authentification().currentUser;
    if (!utilisateur) {
      setErreurImport('Votre session a expiré. Reconnectez-vous, votre collage reste à l’écran.');
      return;
    }

    setImportEnCours(true);
    setProgression(0);
    setErreurImport(undefined);

    const ecrites: number[] = [];
    const echouees: { numero: number; message: string }[] = [];

    // Ligne par ligne, et sans s'arrêter à la première qui tombe : une panne
    // réseau au milieu d'un lot ne doit pas perdre les quarante précédentes.
    for (const analyse of pretes) {
      try {
        await creerQuestion(analyse.question!, utilisateur.uid);
        ecrites.push(analyse.ligne.numero);
      } catch {
        echouees.push({
          numero: analyse.ligne.numero,
          message: "L’écriture a échoué. La ligne est restée dans la prévisualisation.",
        });
      }
      setProgression((precedente) => precedente + 1);
    }

    setImportees((precedentes) => [...precedentes, ...ecrites]);
    setRapport({ ecrites: ecrites.length, echouees });
    setImportEnCours(false);
  }

  if (chargement) {
    return (
      <div style={{ padding: '36px 40px' }}>
        <Squelettes lignes={5} />
      </div>
    );
  }

  if (erreurChargement) {
    return (
      <div style={{ padding: '36px 40px' }}>
        <EtatErreur
          titre="Import indisponible"
          texte={`${erreurChargement.texte} Sans le référentiel, une question ne peut être rattachée à aucune formation.`}
          action={
            erreurChargement.reessayable ? (
              <Bouton
                variante="secondaire"
                iconeGauche={<Icone nom="refresh" taille={16} />}
                onClick={() => window.location.reload()}
              >
                Réessayer
              </Bouton>
            ) : undefined
          }
        />
      </div>
    );
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
        titre="Import en masse"
        sous="Collez un tableau de questions. Une ligne par question, la première ligne donne le nom des colonnes."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 380px) 1fr',
          gap: 'var(--space-8)',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <ZoneDeTexte
            label="Tableau collé"
            aide={`Tabulations ou CSV. Plusieurs valeurs dans une cellule se séparent par « ${SEPARATEUR_VALEURS} ».`}
            value={colle}
            onChange={coller}
            lignes={10}
            mono
            placeholder={`${ENTETE_MODELE}\nchoix multiples\tQuels publics… ?\t\tInfirmiers|Kinés\t1\tParce que…\tPlaies et cicatrisation\tpublics`}
          />

          <Analyse
            lues={lignes.length}
            pretes={pretes.length}
            aCorriger={enErreur.length}
            collage={collage}
          />

          {rapport && (
            <Confirmation>
              {rapport.ecrites} question{rapport.ecrites > 1 ? 's' : ''} importée
              {rapport.ecrites > 1 ? 's' : ''} en brouillon
              {rapport.echouees.length > 0
                ? ` · ${rapport.echouees.length} écriture${rapport.echouees.length > 1 ? 's' : ''} en échec`
                : ''}
            </Confirmation>
          )}

          {erreurImport && <EtatErreur titre="Import interrompu" texte={erreurImport} />}

          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <Bouton
              taille="lg"
              disabled={pretes.length === 0 || importEnCours}
              iconeGauche={<Icone nom="upload" taille={16} />}
              onClick={() => void importer()}
            >
              {importEnCours
                ? `Import en cours… ${progression} sur ${pretes.length}`
                : pretes.length === 0
                  ? 'Rien à importer'
                  : `Importer ${pretes.length} question${pretes.length > 1 ? 's' : ''}`}
            </Bouton>
            <Bouton
              taille="lg"
              variante="secondaire"
              disabled={colle.length === 0 || importEnCours}
              onClick={() => coller('')}
            >
              Vider
            </Bouton>
          </div>

          {rapport && rapport.ecrites > 0 && (
            <Bouton variante="fantome" onClick={() => router.push('/admin/questions')}>
              Voir les brouillons dans la banque
            </Bouton>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
              flexWrap: 'wrap',
            }}
          >
            <TitreSection indice="avant import">Prévisualisation</TitreSection>
            <span style={{ marginLeft: 'auto' }}>
              <Onglets items={FILTRES} valeur={filtre} onChange={setFiltre} />
            </span>
          </div>

          {collage.etat === 'vide' && (
            <EtatVide
              icone="upload"
              titre="Rien à importer pour l’instant"
              texte="Collez votre tableau à gauche. La première ligne doit nommer les colonnes : c’est elle qui dit où se trouve quoi."
              actions={<BoutonEnteteModele />}
            />
          )}

          {collage.etat === 'entete-illisible' && (
            <EtatErreur
              titre="En-tête non reconnu"
              texte={`Ces colonnes obligatoires n’ont pas été trouvées : ${collage.manquantes
                .map((colonne) => LIBELLES_COLONNE[colonne])
                .join(', ')}. La première ligne du tableau doit porter le nom des colonnes.`}
              action={<BoutonEnteteModele />}
            />
          )}

          {collage.etat === 'lu' && affichees.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {affichees.map((analyse) => (
                  <LignePrevisualisation
                    key={analyse.ligne.numero}
                    analyse={analyse}
                    importee={dejaEcrite(analyse.ligne.numero)}
                    formations={formations}
                    onCorriger={corriger}
                  />
              ))}
            </div>
          )}

          {collage.etat === 'lu' && affichees.length === 0 && (
            <EtatVide
              icone="filter"
              titre="Aucune ligne dans ce filtre"
              texte={
                filtre === 'erreur'
                  ? 'Toutes les lignes sont prêtes : il n’y a rien à corriger.'
                  : 'Aucune ligne ne remplit ce filtre pour l’instant.'
              }
              actions={
                <Bouton variante="secondaire" onClick={() => setFiltre('toutes')}>
                  Voir toutes les lignes
                </Bouton>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function BoutonEnteteModele() {
  const [copie, setCopie] = useState(false);

  return (
    <Bouton
      variante="secondaire"
      iconeGauche={<Icone nom={copie ? 'check' : 'copy'} taille={16} />}
      onClick={() => {
        void navigator.clipboard.writeText(ENTETE_MODELE).then(() => {
          setCopie(true);
          window.setTimeout(() => setCopie(false), 2500);
        });
      }}
    >
      {copie ? 'En-tête copié' : 'Copier l’en-tête modèle'}
    </Bouton>
  );
}

function Analyse({
  lues,
  pretes,
  aCorriger,
  collage,
}: {
  lues: number;
  pretes: number;
  aCorriger: number;
  collage: ResultatCollage;
}) {
  const chiffres: { valeur: number; libelle: string; alerte?: boolean }[] = [
    { valeur: lues, libelle: lues > 1 ? 'lignes lues' : 'ligne lue' },
    { valeur: pretes, libelle: pretes > 1 ? 'prêtes' : 'prête' },
    { valeur: aCorriger, libelle: 'à corriger', alerte: aCorriger > 0 },
  ];

  return (
    <Carte rayon="var(--radius-lg)" rembourrage="18px 20px" elevation="petite">
      <span
        style={{
          display: 'block',
          fontSize: 'var(--body-sm-size)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-heading)',
          marginBottom: 10,
        }}
      >
        Analyse
      </span>
      <div style={{ display: 'flex', gap: 'var(--space-6)' }}>
        {chiffres.map((chiffre) => (
          <span key={chiffre.libelle}>
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-display)',
                fontSize: 26,
                lineHeight: 1,
                color: chiffre.alerte ? 'var(--status-danger-texte)' : 'var(--text-heading)',
              }}
            >
              {chiffre.valeur}
            </span>
            <Meta style={{ fontSize: 12 }}>{chiffre.libelle}</Meta>
          </span>
        ))}
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
        {"Les lignes en erreur se corrigent ici même. Elles ne bloquent pas l’import des autres, et tout ce qui entre arrive en brouillon."}
      </p>
      {collage.etat === 'lu' && collage.ignorees.length > 0 && (
        <Meta style={{ display: 'block', marginTop: 10, fontSize: 12 }}>
          Colonnes lues mais non utilisées : {collage.ignorees.join(', ')}.
        </Meta>
      )}
      {collage.etat === 'lu' && (
        <Meta style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
          Séparateur détecté : {collage.separateur}.
        </Meta>
      )}
    </Carte>
  );
}

const COLONNES_TABLEAU = {
  numero: 34,
  statut: 96,
} as const;

/**
 * Une ligne, et sous elle ses erreurs.
 *
 * Le cadre entoure l'ensemble d'un seul trait : la maquette dessine une boîte
 * en deux morceaux, ce qui reviendrait à border un bloc sur trois côtés. Un
 * cadre unique donne le même résultat à l'œil sans bordure partielle.
 */
function LignePrevisualisation({
  analyse,
  importee,
  formations,
  onCorriger,
}: {
  analyse: LigneAnalysee;
  importee: boolean;
  formations: Formation[];
  onCorriger: (numero: number, colonne: Colonne, valeur: string) => void;
}) {
  const enErreur = analyse.erreurs.length > 0;
  const valeurs = analyse.ligne.valeurs;

  const libellesBonnesReponses = analyse.brouillon.bonnesReponses
    .map((identifiant) => analyse.brouillon.options[identifiant])
    .filter((libelle): libelle is string => Boolean(libelle))
    .join(' · ');

  return (
    <div
      style={{
        border: enErreur ? '1px solid rgba(194,66,66,0.30)' : 'none',
        borderRadius: 'var(--radius-md)',
        background: enErreur ? 'rgba(194,66,66,0.06)' : 'var(--surface-card)',
        boxShadow: enErreur ? 'none' : 'var(--shadow-card-sm)',
        overflow: 'hidden',
        opacity: importee ? 0.55 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-4)',
          padding: '13px 18px',
        }}
      >
        <span
          style={{
            width: COLONNES_TABLEAU.numero,
            flex: 'none',
            paddingTop: 2,
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--neutral-60)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {analyse.ligne.numero}
        </span>

        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 'var(--body-sm-size)',
              color: 'var(--text-body)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {valeurs.enonce || '—'}
          </span>
          <span
            style={{
              display: 'flex',
              gap: 'var(--space-4)',
              marginTop: 4,
              minWidth: 0,
            }}
          >
            <Meta style={{ fontSize: 12, flex: 'none' }}>{valeurs.format || 'format absent'}</Meta>
            <Meta
              style={{
                fontSize: 12,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {libellesBonnesReponses || valeurs.bonnesReponses || 'aucune bonne réponse'}
            </Meta>
          </span>
        </span>

        <span style={{ width: COLONNES_TABLEAU.statut, flex: 'none', paddingTop: 1 }}>
          {importee ? (
            <EtiquetteStatut ton="brouillon">Importée</EtiquetteStatut>
          ) : enErreur ? (
            <EtiquetteStatut ton="erreur">À corriger</EtiquetteStatut>
          ) : (
            <EtiquetteStatut ton="publiee">Prête</EtiquetteStatut>
          )}
        </span>
      </div>

      {analyse.erreurs.map((erreur, position) => (
        <Correction
          key={`${erreur.colonne ?? 'ligne'}-${position}`}
          erreur={erreur}
          numero={analyse.ligne.numero}
          valeurs={valeurs}
          formations={formations}
          onCorriger={onCorriger}
        />
      ))}
    </div>
  );
}

/** L'erreur, et le contrôle qui la répare, côte à côte. */
function Correction({
  erreur,
  numero,
  valeurs,
  formations,
  onCorriger,
}: {
  erreur: ErreurLigne;
  numero: number;
  valeurs: Record<Colonne, string>;
  formations: Formation[];
  onCorriger: (numero: number, colonne: Colonne, valeur: string) => void;
}) {
  const colonne = erreur.colonne;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        background: 'rgba(194,66,66,0.10)',
        padding: '10px 18px',
        flexWrap: 'wrap',
      }}
    >
      <Icone nom="alert" taille={15} couleur="var(--status-danger)" />
      <span
        style={{
          flex: 1,
          minWidth: 220,
          fontSize: 'var(--body-sm-size)',
          lineHeight: 1.45,
          color: 'var(--status-danger-texte)',
        }}
      >
        {colonne && (
          <strong style={{ fontWeight: 'var(--weight-semibold)' }}>
            {LIBELLES_COLONNE[colonne]} —{' '}
          </strong>
        )}
        {erreur.message}
      </span>
      {colonne && (
        <span style={{ flex: 'none' }}>
          <ControleCorrection
            colonne={colonne}
            jeton={erreur.jeton}
            numero={numero}
            valeurs={valeurs}
            formations={formations}
            onCorriger={onCorriger}
          />
        </span>
      )}
    </div>
  );
}

function ControleCorrection({
  colonne,
  jeton,
  numero,
  valeurs,
  formations,
  onCorriger,
}: {
  colonne: Colonne;
  jeton?: string;
  numero: number;
  valeurs: Record<Colonne, string>;
  formations: Formation[];
  onCorriger: (numero: number, colonne: Colonne, valeur: string) => void;
}) {
  /**
   * Remplacer la valeur fautive, pas la cellule : une formation inconnue au
   * milieu de deux valides ne doit pas emporter les deux autres.
   */
  const remplacerJeton = (choisie: string) => {
    const actuelle = valeurs[colonne];
    if (!jeton) return choisie;
    return actuelle
      .split(SEPARATEUR_VALEURS)
      .map((valeur) => (valeur.trim() === jeton ? choisie : valeur.trim()))
      .filter((valeur) => valeur.length > 0)
      .join(SEPARATEUR_VALEURS);
  };

  if (colonne === 'format') {
    return (
      <Selecteur
        options={[
          { valeur: '', libelle: 'Choisir un format' },
          ...FORMATS_PROPOSES.map((format) => ({
            valeur: format.libelle,
            libelle: format.libelle,
          })),
        ]}
        value=""
        onChange={(valeur) => valeur && onCorriger(numero, 'format', valeur)}
        style={{ width: 190 }}
      />
    );
  }

  if (colonne === 'difficulte') {
    return (
      <Selecteur
        options={[
          { valeur: '', libelle: 'Choisir une difficulté' },
          ...DIFFICULTES.map((niveau) => ({
            valeur: LIBELLES_DIFFICULTE[niveau],
            libelle: LIBELLES_DIFFICULTE[niveau],
          })),
        ]}
        value=""
        onChange={(valeur) => valeur && onCorriger(numero, 'difficulte', valeur)}
        style={{ width: 190 }}
      />
    );
  }

  if (colonne === 'formations') {
    return (
      <Selecteur
        options={[
          { valeur: '', libelle: 'Choisir une formation' },
          // La valeur est l'identifiant, jamais le nom : deux formations du
          // catalogue portent le même nom, et un nom en double désignerait
          // l'une pour l'autre au hasard.
          ...formations
            .filter((formation) => formation.actif)
            .map((formation) => ({
              valeur: formation.id,
              libelle: formation.numeroActionDpc
                ? `${formation.nom} — ${formation.numeroActionDpc}`
                : formation.nom,
            })),
        ]}
        value=""
        onChange={(valeur) => valeur && onCorriger(numero, 'formations', remplacerJeton(valeur))}
        style={{ width: 260 }}
      />
    );
  }

  return (
    <Champ
      value={valeurs[colonne]}
      onChange={(valeur) => onCorriger(numero, colonne, valeur)}
      placeholder={`Corriger « ${LIBELLES_COLONNE[colonne]} »`}
      style={{ width: 300 }}
    />
  );
}
