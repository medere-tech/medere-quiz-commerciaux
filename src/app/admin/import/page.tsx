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
  TitreSection,
  ZoneDeTexte,
} from '@/composants/ds/primitives';
import { Confirmation, EtatErreur, EtatVide, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { chargerFormations, type Formation } from '@/lib/formations/depot';
import { echecDeLecture, type EchecDeLecture } from '@/lib/firebase/erreurs';
import { authentification } from '@/lib/firebase/client';
import { creerQuestion, enoncesDejaEnBanque } from '@/lib/questions/depot';
import { LIBELLES_DIFFICULTE, DIFFICULTES } from '@/lib/questions/modele';
import { ENTETE_MODELE, LIBELLES_COLONNE, type Colonne } from '@/lib/import/colonnes';
import { lireCollage, lireFeuille, type ResultatCollage } from '@/lib/import/collage';
import {
  ACCEPT_FICHIER,
  EXTENSIONS_ACCEPTEES,
  lireFichier,
  type FeuilleClasseur,
} from '@/lib/import/fichier';
import {
  analyserLigne,
  signalerDoublons,
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

/**
 * Écritures menées de front. Assez pour que deux cents questions passent en
 * quelques secondes, assez peu pour ne pas saturer la connexion ni les quotas
 * d'écriture de Firestore.
 */
const ECRITURES_SIMULTANEES = 8;

export default function PageImport() {
  const router = useRouter();

  const [formations, setFormations] = useState<Formation[]>([]);
  /** Énoncés déjà en banque, pour repérer les doublons sans les bloquer. */
  const [enoncesExistants, setEnoncesExistants] = useState<string[]>([]);
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
  const [lectureEnCours, setLectureEnCours] = useState(false);
  const [fichierDepose, setFichierDepose] = useState<string>();
  const [erreurFichier, setErreurFichier] = useState<string>();
  const [classeur, setClasseur] = useState<{ nom: string; feuilles: FeuilleClasseur[] }>();
  const [feuilleChoisie, setFeuilleChoisie] = useState('');

  useEffect(() => {
    let vivant = true;

    async function charger() {
      try {
        const liste = await chargerFormations();
        if (!vivant) return;
        setFormations(liste);
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
  /** Tout nouveau lot efface le précédent, corrections comprises. */
  function reinitialiser(resultat: ResultatCollage) {
    setCollage(resultat);
    setLignes(resultat.etat === 'lu' ? resultat.lignes : []);
    setImportees([]);
    setRapport(undefined);
    setErreurImport(undefined);
  }

  /**
   * Le collage est analysé à la frappe, et non dans un effet : c'est la
   * conséquence directe du geste, pas une synchronisation avec un système
   * extérieur.
   */
  function coller(texte: string) {
    setColle(texte);
    setFichierDepose(undefined);
    setErreurFichier(undefined);
    setClasseur(undefined);
    setFeuilleChoisie('');
    reinitialiser(lireCollage(texte));
  }

  /**
   * Les chemins d'entrée se rejoignent sur la grille, pas sur le texte : un
   * fichier texte est découpé comme un collage, une feuille de classeur arrive
   * déjà en cellules. Aucun analyseur en double.
   */
  async function recevoirFichier(fichier: File | undefined) {
    if (!fichier) return;

    setErreurFichier(undefined);
    setLectureEnCours(true);

    try {
      const resultat = await lireFichier(fichier);

      if (resultat.etat === 'refuse') {
        setErreurFichier(resultat.message);
        return;
      }

      if (resultat.etat === 'texte') {
        setColle(resultat.texte);
        setClasseur(undefined);
        setFeuilleChoisie('');
        setFichierDepose(
          resultat.encodage === 'windows-1252'
            ? `${resultat.nom} — lu en Windows-1252`
            : resultat.nom,
        );
        reinitialiser(lireCollage(resultat.texte));
        return;
      }

      const premiere = resultat.feuilles[0];
      if (!premiere) return;

      setColle('');
      setClasseur({ nom: resultat.nom, feuilles: resultat.feuilles });
      setFeuilleChoisie(premiere.nom);
      setFichierDepose(resultat.nom);
      reinitialiser(lireFeuille(premiere.nom, premiere.cellules));
    } finally {
      setLectureEnCours(false);
    }
  }

  /** Un classeur à plusieurs feuilles : on change de feuille sans redéposer. */
  function choisirFeuille(nomFeuille: string) {
    const feuille = classeur?.feuilles.find((candidate) => candidate.nom === nomFeuille);
    if (!feuille) return;
    setFeuilleChoisie(nomFeuille);
    reinitialiser(lireFeuille(feuille.nom, feuille.cellules));
  }

  const index = useMemo(() => indexerFormations(formations), [formations]);

  /*
   * On ne demande à la banque que les énoncés effectivement collés, par lots
   * de trente — au lieu de la télécharger en entier pour comparer. La requête
   * part à chaque changement du tableau, jamais au chargement de l'écran :
   * sans tableau, il n'y a rien à comparer.
   */
  useEffect(() => {
    let vivant = true;
    const enonces = lignes
      .map((ligne) => ligne.valeurs.enonce ?? '')
      .filter((enonce) => enonce.trim().length > 0);

    void (async () => {
      try {
        // Sans énoncé collé, rien à demander : la liste se vide sans requête.
        const trouves = enonces.length === 0 ? new Set<string>() : await enoncesDejaEnBanque(enonces);
        if (vivant) setEnoncesExistants([...trouves]);
      } catch (probleme) {
        // Un doublon non signalé n'empêche pas d'importer : on n'interrompt
        // pas la prévisualisation pour autant, on le dit à la console.
        console.error('Recherche de doublons impossible', probleme);
        if (vivant) setEnoncesExistants([]);
      }
    })();

    return () => {
      vivant = false;
    };
  }, [lignes]);

  const analyses = useMemo(
    () => signalerDoublons(lignes.map((ligne) => analyserLigne(ligne, index)), enoncesExistants),
    [lignes, index, enoncesExistants],
  );

  const dejaEcrite = (numero: number) => importees.includes(numero);

  const pretes = analyses.filter(
    (analyse) => analyse.question !== null && !dejaEcrite(analyse.ligne.numero),
  );
  const enErreur = analyses.filter((analyse) => analyse.erreurs.length > 0);
  const sansDifficulte = analyses.filter((analyse) =>
    analyse.avertissements.some((a) => a.genre === 'difficulte-par-defaut'),
  ).length;
  const doublons = analyses.filter((analyse) =>
    analyse.avertissements.some((a) => a.genre === 'doublon'),
  ).length;

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

    /**
     * Une ligne à la fois, mais plusieurs de front.
     *
     * Ligne par ligne en série, soixante questions demandaient près d'une
     * minute : chaque écriture attend l'aller-retour de la précédente. Un
     * lot de deux cents deviendrait un temps mort de plusieurs minutes, et
     * Noémie n'a aucune raison de le subir.
     *
     * Ce n'est pas une écriture groupée pour autant. Une écriture groupée est
     * tout ou rien : une ligne refusée emporterait les quarante-neuf autres,
     * ce qui contredit la règle de l'écran. Chaque question garde donc son
     * écriture et son verdict propres ; seule l'attente est mutualisée.
     */
    const file = [...pretes];
    const ecrire = async () => {
      for (;;) {
        const analyse = file.shift();
        if (!analyse) return;
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
    };

    await Promise.all(
      Array.from({ length: Math.min(ECRITURES_SIMULTANEES, file.length) }, ecrire),
    );

    setImportees((precedentes) => [...precedentes, ...ecrites]);
    setRapport({ ecrites: ecrites.length, echouees });
    setImportEnCours(false);
  }

  if (chargement) {
    return (
      <div style={{ padding: 'clamp(20px, 3.2vw, 36px) clamp(16px, 3.2vw, 40px)' }}>
        <Squelettes lignes={5} />
      </div>
    );
  }

  if (erreurChargement) {
    return (
      <div style={{ padding: 'clamp(20px, 3.2vw, 36px) clamp(16px, 3.2vw, 40px)' }}>
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
    <div className="page-admin">
      <TitrePage
        titre="Import en masse"
        sous="Collez un tableau de questions. Une ligne par question, la première ligne donne le nom des colonnes."
      />

      <div
        className="grille-deux-colonnes"
        style={{ gridTemplateColumns: 'minmax(320px, 380px) 1fr' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <DepotFichier
            nom={fichierDepose}
            erreur={erreurFichier}
            occupe={lectureEnCours}
            feuilles={classeur?.feuilles.map((feuille) => feuille.nom) ?? []}
            feuilleChoisie={feuilleChoisie}
            onFeuille={choisirFeuille}
            onFichier={(fichier) => void recevoirFichier(fichier)}
            onErreur={setErreurFichier}
          />

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
            sansDifficulte={sansDifficulte}
            doublons={doublons}
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
  sansDifficulte,
  doublons,
  collage,
}: {
  lues: number;
  pretes: number;
  aCorriger: number;
  sansDifficulte: number;
  doublons: number;
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
      {sansDifficulte > 0 && (
        <Meta style={{ display: 'block', marginTop: 10, fontSize: 12 }}>
          {`${sansDifficulte} question${sansDifficulte > 1 ? 's' : ''} sans difficulté déclarée, ` +
            `mise${sansDifficulte > 1 ? 's' : ''} en « facile ».`}
        </Meta>
      )}
      {doublons > 0 && (
        <Meta style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
          {`${doublons} énoncé${doublons > 1 ? 's' : ''} déjà vu${doublons > 1 ? 's' : ''} : ` +
            `l’import les créera quand même, en double.`}
        </Meta>
      )}
      {collage.etat === 'lu' && collage.ignorees.length > 0 && (
        <Meta style={{ display: 'block', marginTop: 10, fontSize: 12 }}>
          Colonnes lues mais non utilisées : {collage.ignorees.join(', ')}.
        </Meta>
      )}
      {collage.etat === 'lu' && (
        <Meta style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
          {collage.provenance.forme === 'texte'
            ? `Séparateur détecté : ${collage.provenance.separateur}.`
            : `Feuille lue : « ${collage.provenance.feuille} ».`}
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
  const averti = !enErreur && analyse.avertissements.length > 0;
  const valeurs = analyse.ligne.valeurs;

  const libellesBonnesReponses = analyse.brouillon.bonnesReponses
    .map((identifiant) => analyse.brouillon.options[identifiant])
    .filter((libelle): libelle is string => Boolean(libelle))
    .join(' · ');

  return (
    <div
      style={{
        border: enErreur
          ? '1px solid rgba(194,66,66,0.30)'
          : averti
            ? '1px solid rgba(254,202,69,0.55)'
            : 'none',
        borderRadius: 'var(--radius-md)',
        background: enErreur ? 'rgba(194,66,66,0.06)' : 'var(--surface-card)',
        boxShadow: enErreur || averti ? 'none' : 'var(--shadow-card-sm)',
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

      {analyse.avertissements.map((avertissement, position) => (
        <div
          key={`avis-${position}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            background: 'rgba(254,202,69,0.22)',
            padding: '9px 18px',
          }}
        >
          <Icone nom="alert" taille={14} couleur="var(--neutral-80)" />
          <span
            style={{
              flex: 1,
              minWidth: 160,
              fontSize: 'var(--body-sm-size)',
              lineHeight: 1.45,
              color: 'var(--neutral-80)',
            }}
          >
            {avertissement.message}
          </span>
        </div>
      ))}

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

/**
 * Dépôt d'un fichier : glisser-déposer, ou sélecteur.
 *
 * Noémie reçoit ses lots en fichier. Lui demander d'ouvrir le tableur, tout
 * sélectionner, copier puis coller, c'est quatre gestes dont chacun peut
 * rater — et un classeur ne se colle pas proprement. La zone accepte donc le
 * fichier directement, et aboutit au même analyseur que le collage.
 *
 * Le champ natif reste dans le document, seulement masqué : c'est lui qui
 * porte l'accessibilité et le dialogue du système. Un bouton qui le
 * déclenche ne fait qu'ajouter une prise plus grande.
 */
function DepotFichier({
  nom,
  erreur,
  occupe,
  feuilles,
  feuilleChoisie,
  onFeuille,
  onFichier,
  onErreur,
}: {
  nom?: string;
  erreur?: string;
  occupe: boolean;
  /** Les feuilles d'un classeur. Vide pour un fichier texte. */
  feuilles: string[];
  feuilleChoisie: string;
  onFeuille: (nom: string) => void;
  onFichier: (fichier: File | undefined) => void;
  onErreur: (message: string) => void;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);

  function deposer(evenement: React.DragEvent) {
    evenement.preventDefault();
    setSurvol(false);

    const fichiers = evenement.dataTransfer.files;
    if (fichiers.length === 0) return;
    if (fichiers.length > 1) {
      onErreur('Déposez un seul fichier à la fois : un lot par import.');
      return;
    }
    onFichier(fichiers[0]);
  }

  return (
    <div>
      <div
        onDragOver={(evenement) => {
          evenement.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={deposer}
        style={{
          border: `1px dashed ${survol ? 'var(--focus-ring)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-lg)',
          background: survol ? 'rgba(0,110,144,0.06)' : 'var(--surface-card)',
          padding: '20px 22px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 'var(--space-4)',
          transition: 'var(--transition-base)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <span
          style={{
            width: 38,
            height: 38,
            flex: 'none',
            borderRadius: 999,
            background: 'var(--surface-page)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icone nom="upload" taille={18} couleur="var(--neutral-70)" />
        </span>

        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 'var(--body-sm-size)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-heading)',
            }}
          >
            {nom ?? 'Déposez votre fichier ici'}
          </span>
          <Meta style={{ fontSize: 12 }}>
            {nom
              ? 'Déposez-en un autre pour le remplacer.'
              : `${EXTENSIONS_ACCEPTEES.join(', ')} — ou collez le tableau ci-dessous.`}
          </Meta>
          </span>
        </span>

        <Bouton
          variante="secondaire"
          pleineLargeur
          disabled={occupe}
          onClick={() => champ.current?.click()}
        >
          {occupe ? 'Lecture du fichier…' : 'Choisir un fichier'}
        </Bouton>

        {feuilles.length > 1 && (
          <span>
            <Selecteur
              label="Feuille du classeur"
              options={feuilles.map((feuille) => ({ valeur: feuille, libelle: feuille }))}
              value={feuilleChoisie}
              onChange={onFeuille}
            />
            <Meta style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
              {`Ce classeur en compte ${feuilles.length}. La première est lue par défaut.`}
            </Meta>
          </span>
        )}

        <input
          ref={champ}
          type="file"
          accept={ACCEPT_FICHIER}
          onChange={(evenement) => {
            onFichier(evenement.target.files?.[0]);
            // Redéposer le même fichier après correction doit relancer la
            // lecture : sans cela, le champ ne signale aucun changement.
            evenement.target.value = '';
          }}
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            whiteSpace: 'nowrap',
          }}
        />
      </div>

      {erreur && (
        <span
          role="alert"
          style={{
            display: 'block',
            marginTop: 'var(--space-2)',
            fontSize: 'var(--body-xs-size)',
            lineHeight: 1.45,
            color: 'var(--status-danger-texte)',
          }}
        >
          {erreur}
        </span>
      )}
    </div>
  );
}
