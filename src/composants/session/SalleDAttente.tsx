'use client';

import type { Route } from 'next';

import { Bouton, Carte, EtiquetteStatut, Meta, Touche } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import { Marque } from '@/composants/ds/Coquille';
import { Picto } from '@/composants/ds/Picto';
import { ArreterSeance } from '@/composants/session/ArreterSeance';
import { CodeQr } from '@/composants/session/CodeQr';
import { Collage, type FormePosee } from '@/composants/session/Collage';
import { Pastille } from '@/composants/session/Pastille';
import { adresseRejoindre } from '@/lib/session/rejoindre';
import { LIBELLES_LIEU, type Participant, type Session } from '@/lib/session/depot';
import {
  animatricePar,
  dureeAnnonceeMinutes,
  titreDeSeance,
  TITRE_PAUSE_PARTICIPANT,
} from '@/lib/session/seance';

/**
 * Page 6 · La salle d'attente de la séance, côté animatrice.
 *
 * **L'écran qui manquait entre « lancer » et « poser la première question ».**
 * Jusqu'ici les deux gestes n'en faisaient qu'un : Noémie cliquait « Lancer »
 * et la question 1 s'affichait devant une salle vide, pendant qu'elle dictait
 * le code. Ce sont pourtant deux moments distincts, et celui du milieu dure
 * deux minutes — le temps de dicter, d'attendre les retardataires, de voir les
 * noms arriver. Cet écran tient ce moment.
 *
 * **Le code est l'élément dominant, et c'est la raison d'être de l'écran.** Il
 * est projeté sur un mur et recopié depuis le fond de la salle : il monte
 * jusqu'à 208 pixels, en Aileron 600 très espacé. Le serif de la marque est
 * écarté ici — ses chiffres et ses capitales ne sont pas assez univoques à
 * cette distance, et un code mal lu est une personne qui n'entre pas.
 *
 * **Rien d'important sous 18 pixels, à aucune largeur.** C'est la règle du
 * système pour les écrans projetés, et elle vaut jusqu'au téléphone : les
 * quatre échelles de densité vivent dans `systeme.css`, en variables.
 *
 * **La liste des présents est en direct.** Elle arrive par le même écouteur que
 * tout le reste, et se trie par ordre d'arrivée pour ne pas sauter quand
 * quelqu'un se connecte — voir `SessionAnimateur`.
 */

/** Positions du décor, reprises de la maquette. Jamais sous un texte. */
const DECOR_LARGE: FormePosee[] = [
  { fichier: 'forme-3-17BEBB.svg', taille: 240, x: -212, y: 780, rotation: 16 },
  { fichier: 'forme-2-FECA45.svg', taille: 190, x: 1700, y: -112, rotation: -14 },
];

export function SalleDAttente({
  session,
  participants,
  onDemarrer,
  onPause,
  onReprendre,
  onTerminer,
  onAbandonner,
  onVerrouiller,
}: {
  session: Session;
  participants: Participant[];
  onDemarrer: () => void;
  onPause: () => void;
  onReprendre: () => void;
  onTerminer: () => void;
  onAbandonner: () => void;
  /** Ferme ou rouvre la porte. Réversible : voir `DansLaSalle`. */
  onVerrouiller: (verrouillee: boolean) => void;
}) {
  const enPause = session.statut === 'pause';
  const verrouillee = session.verrouillee;
  const animatrice = animatricePar(session);
  const minutes = dureeAnnonceeMinutes(session);
  const attendus = session.effectifAttendu;
  const manquants = attendus - participants.length;

  return (
    <div className="salle-attente" data-pause={enPause ? 'oui' : 'non'}>
      <Collage formes={DECOR_LARGE} style={{ zIndex: 0 }} />

      <header className="salle-attente-entete">
        <Marque contexte="Quiz Médéré" taille={38} tailleLibelle="var(--sa-meta-l)" />
        <span className="salle-attente-identite">
          <EtiquetteStatut ton={enPause ? 'attention' : 'publiee'}>
            {enPause ? 'En pause' : 'Séance ouverte'}
          </EtiquetteStatut>
          {animatrice && (
            <Meta style={{ fontSize: 'var(--sa-meta-l)' }}>Animée par {animatrice}</Meta>
          )}
        </span>
        <Bouton
          variante="fantome"
          href={'/admin/session' as Route}
          iconeGauche={<Icone nom="clock" taille={18} />}
          style={{ marginLeft: 'auto', fontSize: 'var(--sa-meta-l)', whiteSpace: 'nowrap' }}
        >
          Historique des séances
        </Bouton>
      </header>

      <div className="salle-attente-corps">
        <div className="salle-attente-principal">
          <div>
            <h1 className="salle-attente-titre">{titreDeSeance(session)}</h1>
            {session.description !== '' && (
              <p className="salle-attente-description">{session.description}</p>
            )}
          </div>

          <BlocCode code={session.code} enPause={enPause} verrouillee={verrouillee} />

          {enPause ? <MiroirDeLaSalle /> : <Chiffres session={session} minutes={minutes} />}

          <div className="salle-attente-commandes">
            <Bouton
              taille="lg"
              iconeGauche={<Icone nom="play" taille={20} />}
              onClick={enPause ? onReprendre : onDemarrer}
              style={{ fontSize: 'var(--sa-btn)', padding: 'var(--sa-btn-pad)' }}
            >
              {enPause ? 'Reprendre la séance' : 'Lancer la première question'}
            </Bouton>

            {!enPause && (
              <Bouton
                taille="lg"
                variante="secondaire"
                iconeGauche={<Icone nom="clock" taille={18} />}
                onClick={onPause}
                style={{ fontSize: 'var(--sa-btn)', padding: 'var(--sa-btn-pad)' }}
              >
                Mettre en pause
              </Bouton>
            )}

            <ArreterSeance
              presentation="salle"
              onTerminer={onTerminer}
              onAbandonner={onAbandonner}
              questionsJouees={0}
              questionsTotal={session.questionIds.length}
            />

            {/*
             * L'aide clavier ne paraît qu'au large : sur une tablette ou un
             * téléphone il n'y a pas de touche Entrée à montrer, et la maquette
             * ne la dessine qu'aux deux grandes largeurs.
             */}
            <span className="salle-attente-clavier">
              <Touche>Entrée</Touche>
              <Meta style={{ fontSize: 'var(--sa-meta-l)' }}>
                {enPause ? 'pour reprendre' : 'pour lancer'}
              </Meta>
            </span>
          </div>
        </div>

        <DansLaSalle
          participants={participants}
          attendus={attendus}
          manquants={manquants}
          verrouillee={verrouillee}
          onVerrouiller={onVerrouiller}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ le code */

/**
 * Le code, et comment y arriver.
 *
 * **L'adresse et le code se lisent ensemble, ou ne servent à rien.** Quelqu'un
 * qui connaît le code sans savoir où le taper est exactement aussi bloqué que
 * quelqu'un qui connaît l'adresse sans le code. Les deux sont donc dans le même
 * bloc, et l'adresse vient du navigateur lui-même — voir `adresseRejoindre`
 * dans `src/lib/session/rejoindre.ts` — pour qu'un écran projeté ne puisse pas
 * afficher une adresse que personne n'a vérifiée. C'est d'ailleurs ce qui se
 * passait : un domaine écrit à la main, celui des adresses électroniques, qui
 * ne sert nulle part à naviguer.
 */
function BlocCode({
  code,
  enPause,
  verrouillee,
}: {
  code: string;
  enPause: boolean;
  verrouillee: boolean;
}) {
  return (
    <Carte rayon="var(--radius-2xl)" rembourrage="var(--sa-code-pad)">
      <div className="salle-attente-acces">
        <div className="salle-attente-acces-texte">
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          aria-hidden="true"
          style={{
            width: 10,
            height: 10,
            flex: 'none',
            borderRadius: 999,
            background:
              verrouillee || enPause ? 'var(--status-warning)' : 'var(--status-success)',
          }}
        />
        <span
          style={{
            fontSize: 'var(--sa-label)',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--neutral-70)',
          }}
        >
          {/*
            * **Pendant la pause, l'étiquette dit ce qui reste vrai.**
            *
            * La maquette écrit ici « Séance en pause » — mais l'état est déjà
            * annoncé deux fois à l'écran, par la pastille du bandeau et par le
            * miroir juste en dessous. Le dire une troisième fois occupait la
            * seule ligne qui pouvait porter une information utile : les règles
            * acceptent une arrivée pendant une pause, et un retardataire peut
            * donc encore entrer. C'est ce qu'il faut savoir en regardant le
            * code, et personne ne le devine.
            *
            * **Le verrou passe devant la pause**, pour la même raison inversée.
            * Un code de deux cents pixels projeté sur un mur est une invitation
            * à entrer ; tant que la porte est fermée, il faut que la ligne qui
            * le surmonte dise le contraire, sans quoi l'écran ment à la salle.
            */}
          {verrouillee
            ? 'Accès fermé, ce code n’ouvre plus'
            : enPause
              ? 'Le code reste valable'
              : 'Code de la séance'}
        </span>
      </span>

      {/*
       * **Aileron, et non le serif de la marque.** À deux cents pixels et à
       * plusieurs mètres, ce qui compte est qu'un 8 ne se lise pas 6 et qu'un S
       * ne se lise pas 5. L'alphabet des codes exclut déjà les paires les plus
       * traîtres — ni O ni 0, ni I ni 1 — mais la graisse et l'interlettrage
       * font le reste du travail.
       */}
      <span className="salle-attente-code">{code}</span>

      <span
        style={{
          display: 'block',
          marginTop: 'var(--sa-code-espace)',
          fontSize: 'var(--sa-meta-l)',
          lineHeight: 1.45,
          color: 'var(--neutral-70)',
        }}
      >
        Sur{' '}
        <span style={{ fontWeight: 600, color: 'var(--neutral-100)' }}>
          {adresseRejoindre()}
        </span>
        <span className="salle-attente-code-suite">
          , puis ce code. Il reste valable toute la séance.
        </span>
        <span className="salle-attente-code-court">, ou par le QR ci-contre.</span>
      </span>
        </div>

        {/*
         * Le QR porte l'adresse *et* le code. Il double le code dicté pour qui
         * a le téléphone en main — le cas de la visioconférence, où l'on entend
         * mal et avec du retard.
         */}
        <span className="salle-attente-qr">
          <CodeQr code={code} />
        </span>
      </div>
    </Carte>
  );
}

/* --------------------------------------------------------------- les chiffres */

function Chiffres({ session, minutes }: { session: Session; minutes: number | null }) {
  const questions = session.questionIds.length;

  /*
   * **Aucun chiffre qui ne soit vrai.** La durée disparaît quand aucun
   * chronomètre ne cadence la séance — « au rythme de la parole » n'est pas
   * zéro minute. L'effectif attendu disparaît quand Noémie ne l'a pas déclaré :
   * l'outil n'a pas de liste d'invités, et un dénominateur inventé serait pire
   * que pas de dénominateur.
   */
  const chiffres: [string, string][] = [
    [String(questions), questions > 1 ? 'questions' : 'question'],
    ...(minutes === null
      ? []
      : ([[String(minutes), 'minutes estimées']] as [string, string][])),
    ...(session.effectifAttendu > 0
      ? ([[String(session.effectifAttendu), 'attendus']] as [string, string][])
      : []),
  ];

  return (
    <div className="salle-attente-chiffres">
      {chiffres.map(([nombre, libelle]) => (
        <span key={libelle}>
          <span className="salle-attente-chiffre">{nombre}</span>
          <span
            style={{
              display: 'block',
              marginTop: 6,
              fontSize: 'var(--sa-meta-l)',
              color: 'var(--neutral-70)',
            }}
          >
            {libelle}
          </span>
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------- ce que la salle voit */

/**
 * Le miroir de la pause.
 *
 * **Il montre le titre exact que les participants ont sous les yeux.** Un
 * miroir qui affiche autre chose que la réalité est pire que pas de miroir :
 * l'animatrice croirait savoir. Le libellé vient donc de la même constante que
 * l'écran du participant, et les deux ne peuvent pas diverger.
 */
function MiroirDeLaSalle() {
  return (
    <Carte
      rayon="var(--radius-xl)"
      rembourrage="var(--sa-miroir-pad)"
      elevation="aucune"
      style={{
        background: 'rgba(254, 202, 69, 0.22)',
        border: '1px solid rgba(254, 202, 69, 0.55)',
      }}
    >
      <div className="salle-attente-miroir">
        <Icone nom="alert" taille={22} epaisseur={1.9} couleur="var(--neutral-100)" />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 'var(--sa-head)',
              fontWeight: 600,
              lineHeight: 1.35,
              color: 'var(--neutral-100)',
            }}
          >
            La salle voit un écran d’attente
          </span>
          <span
            style={{
              display: 'block',
              marginTop: 5,
              fontSize: 'var(--sa-meta-l)',
              lineHeight: 1.5,
              color: 'var(--neutral-80)',
            }}
          >
            Les réponses sont bloquées. Le classement en cours est conservé.
          </span>
        </span>
        <span className="salle-attente-vignette">
          <span
            style={{
              display: 'block',
              fontSize: 18,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'rgba(255, 255, 255, 0.82)',
            }}
          >
            Vu par la salle
          </span>
          <span
            style={{
              display: 'block',
              marginTop: 6,
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--sa-vignette)',
              lineHeight: 1.2,
              color: '#fff',
            }}
          >
            {TITRE_PAUSE_PARTICIPANT}
          </span>
        </span>
      </div>
    </Carte>
  );
}

/* ------------------------------------------------------------- dans la salle */

function DansLaSalle({
  participants,
  attendus,
  manquants,
  verrouillee,
  onVerrouiller,
}: {
  participants: Participant[];
  attendus: number;
  manquants: number;
  verrouillee: boolean;
  onVerrouiller: (verrouillee: boolean) => void;
}) {
  const vide = participants.length === 0;

  return (
    <Carte
      rayon="var(--radius-xl)"
      rembourrage="var(--sa-panneau-pad)"
      className="salle-attente-panneau"
    >
      <section
        aria-labelledby="salle-attente-presents"
        style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 12, flex: 'none' }}>
          <h2
            id="salle-attente-presents"
            style={{
              margin: 0,
              fontSize: 'var(--sa-head)',
              fontWeight: 600,
              color: 'var(--neutral-100)',
            }}
          >
            Dans la salle
          </h2>
          <span
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 6 }}
          >
            <span
              className="salle-attente-chiffre"
              style={{ color: vide ? 'var(--neutral-60)' : 'var(--neutral-100)' }}
            >
              {participants.length}
            </span>
            <span style={{ fontSize: 'var(--sa-meta-l)', color: 'var(--neutral-70)' }}>
              {/*
               * « 8 sur 10, 2 attendus » quand l'effectif est déclaré ; le seul
               * compte sinon. On n'invente pas de dénominateur.
               */}
              {attendus > 0
                ? manquants > 0
                  ? `sur ${attendus}, ${manquants} attendu${manquants > 1 ? 's' : ''}`
                  : `sur ${attendus}, tout le monde est là`
                : participants.length > 1
                  ? 'présents'
                  : 'présent'}
            </span>
          </span>
        </span>

        {vide ? (
          <div className="salle-attente-vide">
            <Picto nom="professions" taille={64} />
            <span className="salle-attente-vide-titre">Personne n’a encore rejoint</span>
            <span
              style={{
                fontSize: 'var(--sa-meta-l)',
                lineHeight: 1.55,
                color: 'var(--neutral-70)',
                maxWidth: 380,
              }}
            >
              Dictez le code à la salle. Les noms apparaissent ici dès la première connexion.
            </span>
          </div>
        ) : (
          <ul className="salle-attente-liste">
            {participants.map((present) => (
              <li key={present.uid} className="salle-attente-present">
                <Pastille nom={present.nom} avatar={present.avatar} taille="var(--sa-avatar)" />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="salle-attente-nom">{present.nom}</span>
                  <span
                    style={{
                      display: 'block',
                      marginTop: 2,
                      fontSize: 'var(--sa-sub)',
                      color: 'var(--neutral-70)',
                    }}
                  >
                    {LIBELLES_LIEU[present.presence]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <VerrouDAcces verrouillee={verrouillee} onVerrouiller={onVerrouiller} />
      </section>
    </Carte>
  );
}

/* ----------------------------------------------------------- la porte */

/**
 * « Verrouiller l'accès », et son contraire.
 *
 * **La maquette ne dessine que l'aller ; le retour est la moitié qui manque.**
 * Un retardataire légitime arrive toujours — une réunion qui déborde, un
 * téléphone qui redémarre —, et un verrou sans retour serait un verrou que
 * Noémie n'oserait jamais poser. La même pastille porte donc les deux gestes,
 * au même endroit, et son libellé dit lequel elle fera.
 *
 * **Ce qu'elle ne fait pas est écrit sous elle.** « Verrouiller » laisse croire
 * qu'on ferme la séance : la ligne d'aide dit que les présents ne bougent pas,
 * parce que c'est exactement la question qu'on se pose la main sur le bouton,
 * devant une salle. Voir `verrouillerAcces` dans le dépôt, et la règle de
 * création d'un marqueur de présence, qui est le seul endroit où le verrou
 * agit.
 *
 * Un vrai bouton, et `aria-pressed` : l'état se lit au lecteur d'écran sans
 * dépendre du libellé.
 */
function VerrouDAcces({
  verrouillee,
  onVerrouiller,
}: {
  verrouillee: boolean;
  onVerrouiller: (verrouillee: boolean) => void;
}) {
  return (
    <div className="salle-attente-verrou">
      <button
        type="button"
        aria-pressed={verrouillee}
        onClick={() => onVerrouiller(!verrouillee)}
        className="salle-attente-verrou-pastille"
        data-ferme={verrouillee ? 'oui' : 'non'}
      >
        {/* La taille vient de la feuille : l'échelle de cet écran vit en
            variables, et un attribut SVG ne résout pas un `var()`. */}
        <Icone nom={verrouillee ? 'users' : 'close'} />
        <span>{verrouillee ? 'Rouvrir l’accès' : 'Verrouiller l’accès'}</span>
      </button>
      <Meta className="salle-attente-verrou-aide">
        {verrouillee
          ? 'Personne ne peut plus entrer. Les présents votent normalement.'
          : 'Ferme la porte aux nouveaux venus. Les présents ne sont pas touchés.'}
      </Meta>
    </div>
  );
}
