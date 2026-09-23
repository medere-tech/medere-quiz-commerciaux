'use client';

import { useCallback, useEffect, useState } from 'react';

import { Bouton, Carte, Champ, EtiquetteStatut, Meta, Touche } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import { Picto } from '@/composants/ds/Picto';
import { ChampCode } from '@/composants/session/ChampCode';
import { Collage, type FormePosee } from '@/composants/session/Collage';
import { ChoixAvatar, Pastille } from '@/composants/session/Pastille';
import { AVATAR_PAR_DEFAUT, type CleAvatar } from '@/lib/session/avatar';
import {
  ecouterPresents,
  LIBELLES_LIEU,
  LIEUX_PRESENCE,
  seanceOuverte,
  type LieuPresence,
  type Participant,
  type Session,
} from '@/lib/session/depot';
import {
  animatricePar,
  dureeAnnonceeMinutes,
  NOM_SESSION_MAX,
  ouvertureEnToutesLettres,
  resumeSeance,
  titreDeSeance,
} from '@/lib/session/seance';

/**
 * 10a et 10b (bureau), 06 et 06b (mobile) · L'accès à la séance collective.
 *
 * **Le seul écran de l'outil où l'on voit d'autres gens avant d'agir.** C'est
 * délibéré : une séance collective commence par le fait d'être plusieurs, et
 * une salle vide qu'on rejoint à l'aveugle ne ressemble à rien. Les présents
 * sont donc nommés, avec leur couleur — celle qu'on retrouvera sur l'écran
 * projeté et au classement.
 *
 * **Ce que cela suppose des règles.** `participants` est la seule collection
 * nominative de l'outil. Sa lecture s'ouvre au domaine, mais uniquement tant
 * que la séance est `encours` ou `pause` : la même clause que celle qui protège
 * déjà la liste des réponses. Pendant la séance, cette liste ne dit rien que la
 * pièce ne voie ; après, il n'en reste aucune archive. Voir `firestore.rules`.
 *
 * **La séance ouverte est trouvée sans code.** Le code sert à confirmer, pas à
 * chercher : `seanceOuverte()` donne déjà celle qui tourne, ce qui permet
 * d'annoncer le sujet, la durée et la salle avant la première frappe. Un code
 * qui ne correspond à aucune séance ouverte reste refusé — c'est l'écran 10b.
 *
 * **Deux refus, et surtout pas le même message.** « Ce code ne mène nulle
 * part » et « la salle est fermée » demandent deux gestes opposés : dans le
 * premier cas on relit le code, dans le second on se signale à l'animatrice,
 * qui rouvre. Les confondre enverrait quelqu'un chercher une faute de frappe
 * dans un code juste, devant une porte qu'un mot aurait suffi à ouvrir. Le
 * code refusé marque le champ ; la salle fermée ne le marque pas — le champ
 * n'y est pour rien.
 *
 * **Une seule déviation assumée sur la maquette** : elle dessine cet écran sans
 * la coquille de navigation, avec son propre logo. Ici il vit dans la coquille,
 * pour deux raisons. La première est que les états de séance eux-mêmes (10c) la
 * gardent, et les en sortir changerait un écran validé au lot 7. La seconde est
 * qu'un écran d'accès sans navigation enferme : qui se trompe de code n'aurait
 * plus de retour vers l'accueil. Le logo de la maquette est donc omis — la
 * coquille le porte déjà, et le répéter serait un doublon. Voir
 * `docs/design-imports.md`.
 */

/** Positions reprises de la maquette, pour une scène de 1440 × 900. */
const DECOR: FormePosee[] = [
  { fichier: 'forme-3-17BEBB.svg', taille: 240, x: -132, y: 128, rotation: 16 },
  { fichier: 'forme-2-FECA45.svg', taille: 190, x: 1330, y: 120, rotation: -14 },
  { fichier: 'forme-5-D87DA9.svg', taille: 210, x: -76, y: 700, rotation: 28 },
  { fichier: 'forme-1-9F84BD.svg', taille: 150, x: 1372, y: 640, rotation: 10 },
];

/** Ce que l'écran sait de la salle : rien encore, personne, ou du monde. */
type Salle = { etat: 'chargement' } | { etat: 'lue'; presents: Participant[] };

/**
 * Ce que donne une tentative d'entrée.
 *
 * Trois issues et non deux : un booléen aurait forcé les deux refus à se
 * ressembler, et c'est exactement ce qu'il ne faut pas.
 */
export type VerdictAcces = 'entre' | 'introuvable' | 'fermee';

export function AccesSeance({
  uid,
  nomPropose,
  codeInitial,
  onRejoindre,
}: {
  /**
   * Qui regarde l'écran.
   *
   * **Sert à une seule chose : savoir si l'on est déjà dans la pièce.** Un
   * onglet rechargé repasse par ici — `sessionId` ne vit que dans l'état React
   * —, et annoncer « accès fermé » à quelqu'un qui figure dans la liste des
   * présents juste à droite serait absurde. La liste est déjà lue pour être
   * affichée : la question ne coûte rien de plus.
   */
  uid: string;
  /** Le prénom du compte, proposé tant que rien n'a été choisi. */
  nomPropose: string;
  /**
   * Le code apporté par l'adresse, quand on arrive en scannant le QR.
   *
   * **Il préremplit, il ne valide pas.** Le nom, la couleur et le lieu de
   * présence restent à choisir : entrer quelqu'un dans une salle sans lui
   * demander sous quel nom il y paraîtra serait pire que de lui faire retaper
   * six caractères.
   */
  codeInitial?: string;
  /**
   * Rejoint la séance, et dit ce qui s'est passé.
   *
   * L'écran ne parle pas à Firestore lui-même : il rend le formulaire et son
   * verdict. C'est `SessionParticipant` qui tient la séance et qui sait quoi
   * faire une fois entré.
   */
  onRejoindre: (
    code: string,
    nom: string,
    avatar: CleAvatar,
    presence: LieuPresence,
  ) => Promise<VerdictAcces>;
}) {
  const [code, setCode] = useState(codeInitial ?? '');
  /*
   * **`null` veut dire « pas encore touché », et ce n'est pas la même chose
   * qu'une chaîne vide.** Le prénom du compte n'arrive qu'après le premier
   * rendu, une fois l'authentification résolue : le champ doit l'adopter à ce
   * moment-là, mais ne plus jamais écraser ce que la personne a tapé — pas même
   * si elle a tout effacé pour saisir autre chose. Une valeur dérivée dit cela
   * exactement, là où un effet qui recopie le prénom demanderait de deviner
   * s'il a déjà couru.
   */
  const [nomSaisi, setNomSaisi] = useState<string | null>(null);
  const nom = nomSaisi ?? nomPropose;
  const [avatar, setAvatar] = useState<CleAvatar>(AVATAR_PAR_DEFAUT);
  /*
   * **En salle ou en visio.** La séance est hybride, et l'animatrice doit
   * savoir qui est devant elle : on n'attend pas de la même façon quelqu'un qui
   * lève la tête et quelqu'un qui est au bout d'un lien. « En salle » par
   * défaut, parce que c'est le cas le plus fréquent et que le défaut doit être
   * celui qu'on ne corrige pas.
   */
  const [presence, setPresence] = useState<LieuPresence>('salle');
  const [recherche, setRecherche] = useState<
    'repos' | 'encours' | 'introuvable' | 'fermee' | 'echec'
  >('repos');

  const [seance, setSeance] = useState<Session | null | undefined>(undefined);
  const [salle, setSalle] = useState<Salle>({ etat: 'chargement' });

  useEffect(() => {
    let vivant = true;
    seanceOuverte()
      .then((trouvee) => {
        if (vivant) setSeance(trouvee);
      })
      .catch((panne: unknown) => {
        /*
         * L'annonce est un supplément, pas l'écran.
         *
         * Si la recherche de la séance ouverte échoue, le formulaire reste
         * parfaitement utilisable : le code suffit à rejoindre. On journalise —
         * une lecture refusée serait un vrai défaut — et on affiche la colonne
         * de droite comme s'il n'y avait pas de séance annoncée.
         */
        console.error('Recherche de la séance ouverte impossible', panne);
        if (vivant) setSeance(null);
      });
    return () => {
      vivant = false;
    };
  }, []);

  useEffect(() => {
    if (!seance) return;
    return ecouterPresents(seance.id, (presents) =>
      setSalle({ etat: 'lue', presents: presents ?? [] }),
    );
  }, [seance]);

  const valider = useCallback(async () => {
    if (code.trim() === '' || nom.trim() === '' || recherche === 'encours') return;
    setRecherche('encours');
    try {
      const verdict = await onRejoindre(code, nom, avatar, presence);
      setRecherche(verdict === 'entre' ? 'repos' : verdict);
    } catch {
      setRecherche('echec');
    }
  }, [code, nom, avatar, presence, recherche, onRejoindre]);

  const introuvable = recherche === 'introuvable';
  const fermee = recherche === 'fermee';
  /* Déjà dans la pièce : la porte fermée ne le concerne pas, et les règles le
     laisseront rentrer — son marqueur existe. */
  const dejaPresent = salle.etat === 'lue' && salle.presents.some((qui) => qui.uid === uid);
  const nomAffiche = nom || nomPropose || '?';
  const peutValider = code.trim() !== '' && nom.trim() !== '' && recherche !== 'encours';

  return (
    <div className="acces-seance">
      {/* Le décor de la maquette bureau. **Absent de la maquette mobile**, et
          retiré du document sous 900 px plutôt que masqué : quatre images
          téléchargées pour n'être jamais peintes ne valent rien sur un
          téléphone. */}
      <span className="acces-seance-decor">
        <Collage formes={DECOR} />
      </span>

      <div className="acces-seance-entete">
        {seance && (
          /* **La porte se dit avant qu'on tape, pas après.** Laisser quelqu'un
             remplir le formulaire entier pour lui répondre « fermé » serait un
             piège poli. L'étiquette de tête est le premier mot de l'écran :
             c'est là que l'état de la porte se lit. */
          <EtiquetteStatut ton={seance.verrouillee && !dejaPresent ? 'attention' : 'publiee'}>
            {seance.verrouillee && !dejaPresent ? 'Accès fermé' : 'Séance ouverte'}
          </EtiquetteStatut>
        )}
        {seance && <EnteteSeance seance={seance} />}
      </div>

      <div className="acces-seance-grille">
        <Carte rayon="var(--radius-2xl)" rembourrage="clamp(24px, 3vw, 36px) clamp(20px, 3vw, 40px) clamp(22px, 2.6vw, 32px)">
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontWeight: 300,
              fontSize: 'clamp(26px, 4.6vw, 34px)',
              lineHeight: 1.15,
              color: 'var(--text-heading)',
            }}
          >
            Rejoindre la{' '}
            <em
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontWeight: 400,
              }}
            >
              session du jeudi
            </em>
          </h1>
          <p
            style={{
              margin: '12px 0 clamp(20px, 2.6vw, 28px)',
              fontSize: 'var(--body-md-size)',
              lineHeight: 1.55,
              color: 'var(--neutral-70)',
              textWrap: 'pretty',
            }}
          >
            {seance
              ? `${seance.questionIds.length} questions, ${phraseSalle(salle)}. Vos réponses restent anonymes pour la salle, sauf votre nom au classement.`
              : 'Vos réponses restent anonymes pour la salle, sauf votre nom au classement.'}
          </p>

          <div className="acces-seance-formulaire">
            <ChampCode
              valeur={code}
              onChange={(saisi) => {
                setCode(saisi);
                // Le verdict porte sur le code soumis, pas sur celui qu'on est
                // en train de taper : il s'efface à la frappe.
                if (introuvable || fermee) setRecherche('repos');
              }}
              onEntree={() => void valider()}
              taille="lg"
              /* Le champ ne se marque que lorsque le champ est en cause. Une
                 salle fermée n'est pas une faute de saisie. */
              erreur={introuvable ? 'Aucune séance ouverte avec ce code.' : undefined}
              aide="Six caractères."
            />

            {/*
              * Annoncé d'avance quand la séance qui tourne est fermée, et
              * confirmé après un refus. Le bouton reste actif dans les deux
              * cas : le code saisi peut désigner une autre séance que celle
              * qui est annoncée ici.
              */}
            {(fermee || (seance?.verrouillee && !dejaPresent && recherche === 'repos')) && (
              <SalleFermee confirme={fermee} />
            )}

            {/*
             * Le nom se règle ici, au moment de rejoindre, et pas dans un écran
             * de préférences : un réglage qu'il faut penser à ouvrir avant le
             * jeudi ne serait jamais ouvert. Il est prérempli avec le choix de
             * la dernière fois, ou le prénom du compte.
             */}
            <Champ
              label="Votre nom au classement"
              value={nom}
              onChange={(saisi) => setNomSaisi(saisi.slice(0, NOM_SESSION_MAX))}
              aide={`Visible par toute la salle, sur l’écran projeté. ${NOM_SESSION_MAX} caractères au plus.`}
              placeholder={nomPropose || 'Votre prénom'}
              autoComplete="off"
            />

            <div>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <Pastille nom={nomAffiche} avatar={avatar} taille={44} />
                <span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 'var(--body-sm-size)',
                      fontWeight: 600,
                      color: 'var(--text-heading)',
                    }}
                  >
                    Votre couleur
                  </span>
                  <span
                    style={{
                      display: 'block',
                      marginTop: 2,
                      fontSize: 'var(--body-xs-size)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Elle vous repère dans la liste des participants.
                  </span>
                </span>
              </span>
              <ChoixAvatar nom={nomAffiche} valeur={avatar} onChoisir={setAvatar} />
            </div>

            <ChoixPresence valeur={presence} onChoisir={setPresence} />
          </div>

          <div className="acces-seance-action acces-seance-barre">
            <Bouton
              taille="lg"
              pleineLargeur
              disabled={!peutValider}
              iconeGauche={<Icone nom="users" taille={17} />}
              onClick={() => void valider()}
            >
              {recherche === 'encours' ? 'Recherche…' : 'Rejoindre'}
            </Bouton>

            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                flexWrap: 'wrap',
                textAlign: 'center',
              }}
            >
              {recherche === 'echec' ? (
                <Meta style={{ fontSize: 12, color: 'var(--status-danger-texte)' }}>
                  La recherche n’a pas abouti. Réessayez dans un instant.
                </Meta>
              ) : introuvable ? (
                <Meta style={{ fontSize: 12 }}>
                  Vérifiez le code auprès de l’animatrice - une séance terminée ne se rejoint
                  plus.
                </Meta>
              ) : fermee ? (
                /* Une ligne, et la même substance que l'encart : sur un
                   téléphone, la barre est fixe et l'encart peut être remonté
                   hors de l'écran au moment du clic. */
                <Meta style={{ fontSize: 12 }}>
                  Le code est bon, mais l’accès est fermé.
                </Meta>
              ) : (
                <>
                  {/*
                   * L'aide au clavier ne s'affiche pas sur un téléphone : il
                   * n'y a pas de touche Entrée à montrer, et la maquette
                   * mobile ne la dessine pas.
                   */}
                  <span className="acces-seance-clavier">
                    <Touche>Entrée</Touche>
                  </span>
                  <Meta style={{ fontSize: 12 }}>
                    <span className="acces-seance-clavier">pour rejoindre, </span>la salle vous
                    voit arriver aussitôt
                  </Meta>
                </>
              )}
            </span>
          </div>
        </Carte>

        {/*
          * La bande compacte du mobile.
          *
          * La maquette 06 ne descend pas les deux cartes de droite l'une sous
          * l'autre : elle les fusionne en une ligne — picto, titre, résumé, et
          * les présents en pastilles superposées. Elle ne vit que sous 900 px,
          * où `display` la retire aussi de l'arbre d'accessibilité : le contenu
          * n'est jamais annoncé deux fois.
          */}
        {seance && <BandeCompacte seance={seance} salle={salle} />}

        <div className="acces-seance-colonne">
          {seance ? (
            <>
              <AuProgramme seance={seance} salle={salle} />
              <DansLaSalle salle={salle} />
            </>
          ) : (
            <AucuneSeance enAttente={seance === undefined} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- salle fermée */

/**
 * « Le code est bon, la porte est fermée. »
 *
 * **Ce n'est pas une erreur de champ, et l'écran ne doit pas le suggérer.** Le
 * champ reste propre : rouge, il enverrait relire un code qui est juste. Le
 * message dit donc trois choses dans cet ordre — le code est bon, la porte est
 * fermée, quelqu'un peut la rouvrir —, parce que c'est l'ordre dans lequel on
 * se les demande.
 *
 * `role="status"` : le verdict arrive après un clic, sans que rien ne bouge
 * ailleurs sur la page. Sans annonce vocale, il n'existerait que pour ceux qui
 * regardent au bon endroit.
 */
function SalleFermee({ confirme }: { confirme: boolean }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 16px',
        borderRadius: 'var(--radius-lg)',
        background: 'rgba(254, 202, 69, 0.22)',
      }}
    >
      <Icone nom="alert" taille={20} epaisseur={1.9} couleur="var(--neutral-100)" />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--body-sm-size)',
            fontWeight: 600,
            lineHeight: 1.35,
            color: 'var(--text-heading)',
          }}
        >
          L’accès à cette séance est fermé
        </span>
        <span
          style={{
            display: 'block',
            marginTop: 4,
            fontSize: 'var(--body-sm-size)',
            lineHeight: 1.5,
            color: 'var(--neutral-80)',
            textWrap: 'pretty',
          }}
        >
          {confirme
            ? 'Votre code est bon. Signalez-vous à l’animatrice : elle peut rouvrir l’accès, et vous entrerez avec le même code.'
            : 'L’animatrice a fermé l’accès pour commencer. Signalez-vous à elle : elle peut le rouvrir, et vous entrerez avec le même code.'}
        </span>
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- où l’on est */

/**
 * En salle ou en visio.
 *
 * **Deux options, donc deux boutons, et pas une liste déroulante.** Le choix se
 * fait une fois, en trois secondes, sur un téléphone entre deux appels : ouvrir
 * un menu pour choisir entre deux valeurs coûte un geste de plus pour rien.
 *
 * Un vrai `radiogroup` : les flèches naviguent, le lecteur d’écran annonce le
 * groupe et l’option cochée.
 */
function ChoixPresence({
  valeur,
  onChoisir,
}: {
  valeur: LieuPresence;
  onChoisir: (lieu: LieuPresence) => void;
}) {
  return (
    <div>
      <span
        style={{
          display: 'block',
          fontSize: 'var(--body-sm-size)',
          fontWeight: 600,
          color: 'var(--text-heading)',
        }}
        id="acces-presence"
      >
        Vous suivez la séance
      </span>
      <span
        style={{
          display: 'block',
          marginTop: 2,
          marginBottom: 10,
          fontSize: 'var(--body-xs-size)',
          color: 'var(--text-secondary)',
        }}
      >
        L’animatrice sait ainsi qui est dans la pièce et qui la suit à distance.
      </span>
      <div
        role="radiogroup"
        aria-labelledby="acces-presence"
        style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
      >
        {LIEUX_PRESENCE.map((lieu) => {
          const actif = lieu === valeur;
          return (
            <button
              key={lieu}
              type="button"
              role="radio"
              aria-checked={actif}
              onClick={() => onChoisir(lieu)}
              style={{
                flex: '1 1 140px',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                // Bordure complète, jamais un filet d’un seul côté.
                border: `1px solid ${actif ? 'var(--neutral-100)' : 'var(--border-default)'}`,
                background: actif ? 'var(--surface-chip)' : 'var(--surface-card)',
                color: 'var(--text-heading)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--body-sm-size)',
                fontWeight: actif ? 600 : 400,
                cursor: 'pointer',
                transition: 'var(--transition-base)',
              }}
            >
              {LIBELLES_LIEU[lieu]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ entête */

function EnteteSeance({ seance }: { seance: Session }) {
  const ouverture = ouvertureEnToutesLettres(seance.ouverteLeMs);
  const animatrice = animatricePar(seance);

  const morceaux = [ouverture, animatrice && `animée par ${animatrice}`].filter(
    (morceau): morceau is string => Boolean(morceau),
  );

  if (morceaux.length === 0) return null;
  return <Meta style={{ fontSize: 13 }}>{morceaux.join(', ')}</Meta>;
}

/* ------------------------------------------------------------ au programme */

function AuProgramme({ seance, salle }: { seance: Session; salle: Salle }) {
  const minutes = dureeAnnonceeMinutes(seance);
  const presents = salle.etat === 'lue' ? salle.presents.length : null;

  /*
   * **« Invités » n'existe pas au modèle, et ne peut pas exister sans mentir.**
   * La maquette annonce un nombre d'invités ; l'outil n'a pas d'invitation —
   * le code est dit à voix haute, et quiconque l'entend entre. Le seul compte
   * de personnes qui soit vrai est celui des présents. Voir
   * `docs/design-imports.md`.
   *
   * **La durée n'est pas affichée quand rien ne la cadence.** Un chronomètre à
   * zéro seconde veut dire « au rythme de la parole » : la colonne disparaît
   * plutôt que d'annoncer un nombre inventé.
   */
  const chiffres: [string, string][] = [
    [String(seance.questionIds.length), seance.questionIds.length > 1 ? 'questions' : 'question'],
    ...(minutes === null
      ? []
      : ([[String(minutes), 'minutes environ']] as [string, string][])),
    ...(presents === null
      ? []
      : ([[String(presents), presents > 1 ? 'déjà là' : 'déjà là']] as [string, string][])),
  ];

  return (
    /*
     * Une région nommée, et pas une carte nue : l'écran d'accès en porte deux
     * — le programme et la salle —, et un lecteur d'écran doit pouvoir sauter
     * de l'une à l'autre au lieu de parcourir tout le formulaire.
     */
    <Carte rayon="var(--radius-xl)" rembourrage="22px 24px">
      <section aria-labelledby="acces-programme">
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Picto nom="calendrier" taille={30} />
        <h2
          id="acces-programme"
          style={{
            margin: 0,
            fontSize: 'var(--body-sm-size)',
            fontWeight: 600,
            color: 'var(--text-heading)',
          }}
        >
          Au programme
        </h2>
      </span>

      <span
        style={{
          display: 'block',
          marginTop: 14,
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          lineHeight: 1.22,
          color: 'var(--text-heading)',
          textWrap: 'pretty',
        }}
      >
        {titreDeSeance(seance)}
      </span>

      {seance.description !== '' && (
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 'var(--body-sm-size)',
            lineHeight: 1.55,
            color: 'var(--neutral-70)',
            textWrap: 'pretty',
          }}
        >
          {seance.description}
        </p>
      )}

      <div style={{ marginTop: 18, display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
        {chiffres.map(([nombre, libelle]) => (
          <span key={libelle}>
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-display)',
                fontSize: 24,
                lineHeight: 1,
                color: 'var(--text-heading)',
              }}
            >
              {nombre}
            </span>
            <Meta style={{ fontSize: 12 }}>{libelle}</Meta>
          </span>
        ))}
      </div>
      </section>
    </Carte>
  );
}

/* --------------------------------------------------------- déjà dans la salle */

function DansLaSalle({ salle }: { salle: Salle }) {
  if (salle.etat === 'chargement') {
    return (
      <Carte rayon="var(--radius-lg)" rembourrage="20px 22px" elevation="petite">
        <Meta style={{ fontSize: 'var(--body-sm-size)' }}>Lecture de la salle…</Meta>
      </Carte>
    );
  }

  return (
    <Carte rayon="var(--radius-lg)" rembourrage="20px 22px" elevation="petite">
      <section aria-labelledby="acces-salle">
      <h2
        id="acces-salle"
        style={{
          margin: '0 0 14px',
          fontSize: 'var(--body-sm-size)',
          fontWeight: 600,
          color: 'var(--text-heading)',
        }}
      >
        Déjà dans la salle
      </h2>

      {salle.presents.length === 0 ? (
        <Meta style={{ fontSize: 'var(--body-sm-size)' }}>
          Personne encore. Vous serez le premier, et les autres vous verront arriver.
        </Meta>
      ) : (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {salle.presents.map((present) => (
            <li key={present.uid} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <Pastille nom={present.nom} avatar={present.avatar} taille={30} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 'var(--body-sm-size)',
                  color: 'var(--text-body)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {present.nom}
              </span>
              <Meta style={{ fontSize: 12 }}>prêt</Meta>
            </li>
          ))}
        </ul>
      )}

      <Meta style={{ display: 'block', marginTop: 14, fontSize: 12 }}>
        L’animatrice lance la première question quand tout le monde est là.
      </Meta>
      </section>
    </Carte>
  );
}

/* ------------------------------------------------------- bande compacte mobile */

function BandeCompacte({ seance, salle }: { seance: Session; salle: Salle }) {
  const presents = salle.etat === 'lue' ? salle.presents : [];
  // Quatre pastilles au plus : au-delà, elles se chevauchent en bouillie sur
  // 375 px, et le compte est déjà dit en toutes lettres au-dessus.
  const montrees = presents.slice(0, 4);

  return (
    /*
     * Un bloc, pas une `Carte` : la maquette mobile dessine elle aussi une
     * surface simple, et il faut pouvoir lui poser un nom accessible.
     *
     * Nommée « Résumé de la séance » et non « Au programme » : au bureau,
     * `display: none` la retire de l'arbre d'accessibilité, mais un outil qui
     * lit le DOM brut verrait sinon deux régions portant le même nom.
     */
    <div
      className="acces-seance-compact"
      role="group"
      aria-label="Résumé de la séance"
      style={{
        background: 'var(--surface-card)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
        boxShadow: 'var(--shadow-card-sm)',
      }}
    >
      <Picto nom="calendrier" taille={28} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--body-sm-size)',
            fontWeight: 600,
            lineHeight: 1.35,
            color: 'var(--text-heading)',
            textWrap: 'pretty',
          }}
        >
          {titreDeSeance(seance)}
        </span>
        <Meta style={{ display: 'block', marginTop: 3, fontSize: 12 }}>
          {resumeSeance(seance)}
        </Meta>
      </span>
      {montrees.length > 0 && (
        <span
          // Les noms sont lus juste au-dessus, en toutes lettres ; ces
          // pastilles sont un repère visuel, pas une seconde liste.
          aria-hidden="true"
          style={{ display: 'flex', flex: 'none' }}
        >
          {montrees.map((present, rang) => (
            <span
              key={present.uid}
              style={{
                marginLeft: rang ? -9 : 0,
                borderRadius: 999,
                boxShadow: '0 0 0 2px var(--surface-card)',
              }}
            >
              <Pastille nom={present.nom} avatar={present.avatar} taille={24} />
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------- aucune séance ouverte */

/**
 * Ce que voit quelqu'un qui arrive un mardi.
 *
 * La maquette ne dessine pas cet état, et il est pourtant le plus fréquent :
 * six jours sur sept, aucune séance ne tourne. Le formulaire reste utilisable —
 * une séance en pause se rejoint avec son code, et elle n'est pas annoncée ici
 * — mais la colonne dit la vérité plutôt que d'afficher un programme vide.
 */
function AucuneSeance({ enAttente }: { enAttente: boolean }) {
  return (
    <Carte rayon="var(--radius-xl)" rembourrage="22px 24px" elevation="petite">
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Picto nom="calendrier" taille={30} />
        <h2
          style={{
            margin: 0,
            fontSize: 'var(--body-sm-size)',
            fontWeight: 600,
            color: 'var(--text-heading)',
          }}
        >
          Au programme
        </h2>
      </span>
      <p
        style={{
          margin: '12px 0 0',
          fontSize: 'var(--body-sm-size)',
          lineHeight: 1.55,
          color: 'var(--neutral-70)',
          textWrap: 'pretty',
        }}
      >
        {enAttente
          ? 'Recherche de la séance en cours…'
          : 'Aucune séance n’est ouverte en ce moment.'}
      </p>
    </Carte>
  );
}

/** « une dizaine de participants », sans annoncer un nombre qu'on n'a pas. */
function phraseSalle(salle: Salle): string {
  if (salle.etat !== 'lue') return 'une dizaine de participants';
  const combien = salle.presents.length;
  if (combien === 0) return 'vous êtes le premier';
  return combien === 1 ? 'une personne déjà là' : `${combien} personnes déjà là`;
}
