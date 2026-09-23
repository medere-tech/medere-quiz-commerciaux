'use client';

import type { CSSProperties, ReactNode } from 'react';

import { Icone } from '@/composants/ds/Icone';
import { Carte, Meta } from '@/composants/ds/primitives';

/**
 * Composants du parcours commercial, repris du système de design.
 *
 * Ils ne vivent pas dans `primitives.tsx` parce qu'ils ne servent qu'ici :
 * une option de réponse et un verdict n'ont pas de sens dans le back-office.
 * Les valeurs — teintes, rayons, épaisseurs — viennent des maquettes, sans
 * ajustement.
 */

/* ------------------------------------------------------ option de réponse */

export type EtatAffichageOption =
  | 'repos'
  | 'selectionnee'
  | 'juste'
  | 'manquee'
  | 'fausse'
  | 'inerte';

const APPARENCE: Record<
  EtatAffichageOption,
  { fond: string; bordure: string; ombre: string; opacite?: number }
> = {
  repos: {
    fond: 'var(--surface-card)',
    bordure: 'var(--border-default)',
    ombre: 'var(--shadow-card-sm)',
  },
  selectionnee: {
    fond: 'var(--surface-chip)',
    bordure: 'var(--border-strong)',
    ombre: 'none',
  },
  juste: { fond: 'rgba(45,161,49,0.10)', bordure: 'var(--status-success)', ombre: 'none' },
  fausse: { fond: 'rgba(194,66,66,0.09)', bordure: 'var(--status-danger)', ombre: 'none' },
  // Attendue mais non cochée : le fond reste neutre, seule la bordure verte
  // dit qu'elle faisait partie de la réponse. C'est ce qui manquait.
  manquee: { fond: 'var(--surface-card)', bordure: 'var(--status-success)', ombre: 'none' },
  inerte: {
    fond: 'var(--surface-card)',
    bordure: 'var(--border-subtle)',
    ombre: 'none',
    opacite: 0.4,
  },
};

/**
 * Le vert et le rouge saturés servent aux pastilles et aux bordures ; le
 * texte de note, à 11 pixels, prend leur version foncée pour rester lisible.
 */
const COULEUR_NOTE: Partial<Record<EtatAffichageOption, string>> = {
  juste: '#1B6B1F',
  manquee: '#1B6B1F',
  fausse: '#9E3232',
};

/**
 * La consigne de réponse : combien de réponses on attend, et ce qu'il en coûte.
 *
 * **Ajout hors maquette, assumé.** Voir `docs/design-imports.md`. La règle du
 * QCM à réponses multiples est la plus contre-intuitive de l'outil — une
 * sélection incomplète est comptée fausse — et elle coûte des points à qui
 * l'ignore. Or la seule chose qui distinguait « une réponse » de « plusieurs »
 * sur deux des trois écrans était **la forme du marqueur** : carré au lieu de
 * rond. Aucun texte. Un commercial qui découvre l'application sur son téléphone
 * un jeudi n'a aucune raison de connaître la convention, et pour un lecteur
 * d'écran elle n'existe pas du tout.
 *
 * **Une seule formulation pour les trois écrans.** L'entraînement le disait
 * déjà, à sa façon ; la séance et l'écran projeté ne le disaient pas. Trois
 * phrases différentes pour une même règle auraient été pires que le silence.
 *
 * **La conséquence est dite, pas seulement la consigne.** « Plusieurs réponses
 * attendues » se lit comme une invitation ; « une réponse incomplète est
 * fausse » se lit comme une règle. C'est la seconde qui change ce qu'on clique.
 *
 * **Portée aux technologies d'assistance.** Le texte porte un `id` que le
 * groupe d'options désigne en `aria-describedby` : la consigne est annoncée à
 * l'entrée du groupe, une fois, et non répétée à chaque option.
 */
export function ConsigneReponses({
  multiple,
  id,
  /** `projete` : lisible à cinq mètres, sur le fond encre de la scène. */
  taille = 'md',
  complement,
}: {
  multiple: boolean;
  id?: string;
  taille?: 'md' | 'projete';
  /** Ce que l'écran ajoute pour lui seul — le décompte des cases cochées. */
  complement?: string;
}) {
  const projete = taille === 'projete';

  return (
    <p
      id={id}
      style={{
        margin: projete ? 'clamp(10px, 1.2vw, 18px) 0 0' : '14px 0 0',
        fontSize: projete ? 'clamp(15px, 1.5vw, 22px)' : 'var(--body-sm-size)',
        lineHeight: 1.45,
        color: projete ? 'rgba(255,255,255,0.72)' : 'var(--text-secondary)',
      }}
    >
      {multiple
        ? 'Plusieurs réponses attendues - une réponse incomplète est comptée fausse.'
        : 'Une seule réponse.'}
      {complement ? ` ${complement}` : ''}
    </p>
  );
}

/**
 * Le groupe des options, nommé et décrit pour les technologies d'assistance.
 *
 * Sans lui, un lecteur d'écran annonce une suite de boutons sans dire qu'ils
 * forment un choix, ni combien de réponses sont attendues. `role="group"` avec
 * son nom et sa description règle les deux d'un coup, et ne change rien à
 * l'affichage — la mise en page reste celle que chaque écran lui passe.
 */
export function GroupeDeReponses({
  decritPar,
  className,
  style,
  children,
}: {
  /** `id` de la consigne, annoncée à l'entrée du groupe. */
  decritPar?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label="Réponses possibles"
      aria-describedby={decritPar}
      className={className}
      style={style}
    >
      {children}
    </div>
  );
}

export function OptionReponse({
  marqueur,
  multiple = false,
  etat = 'repos',
  note,
  taille = 'md',
  onClick,
  children,
}: {
  /** Chiffre ou lettre affiché dans la pastille, et raccourci clavier. */
  marqueur: string;
  multiple?: boolean;
  etat?: EtatAffichageOption;
  note?: string;
  taille?: 'sm' | 'md';
  onClick?: () => void;
  children: ReactNode;
}) {
  const apparence = APPARENCE[etat];
  const corrigee = etat === 'juste' || etat === 'manquee' || etat === 'fausse';
  const teinte =
    etat === 'juste' || etat === 'manquee'
      ? 'var(--status-success)'
      : etat === 'fausse'
        ? 'var(--status-danger)'
        : null;

  const contenu = (
    <>
      <span
        aria-hidden="true"
        style={{
          flex: 'none',
          width: 26,
          height: 26,
          marginTop: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: multiple ? 'var(--radius-sm)' : 999,
          /*
           * La pastille de l'option manquée est cerclée, pas pleine. Pleine,
           * elle est identique à celle de la réponse trouvée : deux coches
           * vertes côte à côte, et il faut lire une note de 11 pixels pour
           * savoir laquelle on a ratée. C'est précisément ce que la
           * correction doit dire d'un coup d'œil.
           */
          background:
            etat === 'manquee'
              ? 'var(--surface-card)'
              : corrigee
                ? (teinte ?? 'transparent')
                : etat === 'selectionnee'
                  ? 'var(--neutral-100)'
                  : 'transparent',
          border:
            '1px solid ' +
            (corrigee
              ? (teinte ?? 'var(--border-default)')
              : etat === 'selectionnee'
                ? 'var(--neutral-100)'
                : 'var(--border-default)'),
          color:
            etat === 'manquee'
              ? 'var(--status-success)'
              : corrigee || etat === 'selectionnee'
                ? 'var(--neutral-0)'
                : 'var(--text-secondary)',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {etat === 'fausse' ? (
          <Icone nom="close" taille={14} epaisseur={2.1} />
        ) : corrigee ? (
          <Icone nom="check" taille={14} epaisseur={2.1} />
        ) : multiple && etat === 'selectionnee' ? (
          <Icone nom="check" taille={14} epaisseur={2.1} />
        ) : (
          marqueur
        )}
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: taille === 'sm' ? 'var(--body-sm-size)' : 'var(--body-md-size)',
            lineHeight: 1.5,
            color: 'var(--text-body)',
            fontWeight: etat === 'selectionnee' ? 600 : 400,
            textWrap: 'pretty',
          }}
        >
          {children}
        </span>
        {note && (
          <span
            style={{
              display: 'block',
              marginTop: 6,
              fontSize: 'var(--body-xs-size)',
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: COULEUR_NOTE[etat] ?? 'var(--neutral-60)',
            }}
          >
            {note}
          </span>
        )}
      </span>
    </>
  );

  /*
   * L'ombre et la bordure passent par des variables, pas par les propriétés
   * elles-mêmes : un `box-shadow` en ligne écrase la règle `:focus-visible`
   * de la feuille de styles, et le halo de focus disparaît au clavier — sur
   * le seul contrôle qu'un commercial pressé utilise vraiment.
   */
  const style: CSSProperties = {
    display: 'flex',
    gap: 'var(--space-3)',
    alignItems: 'flex-start',
    width: '100%',
    textAlign: 'left',
    padding: taille === 'sm' ? '12px 14px' : '15px 18px',
    background: apparence.fond,
    borderRadius: 'var(--radius-lg)',
    opacity: apparence.opacite,
    transition: 'var(--transition-base)',
    font: 'inherit',
    ['--bordure-option' as string]: apparence.bordure,
    ['--ombre-option' as string]: apparence.ombre,
  };

  // Répondre est une action : c'est un bouton, pas une case décorée. Le
  // clavier, le focus visible et la restitution vocale viennent avec.
  if (!onClick) return <div className="option-reponse" style={style}>{contenu}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={etat === 'selectionnee'}
      className="option-reponse"
      style={{ ...style, cursor: 'pointer' }}
    >
      {contenu}
    </button>
  );
}

/* ------------------------------------------------------ moment signature */

export function Verdict({
  ton,
  titre,
  compact = false,
  children,
}: {
  ton: 'ok' | 'ko';
  titre: string;
  compact?: boolean;
  children: ReactNode;
}) {
  const ok = ton === 'ok';
  const teinte = ok ? 'var(--status-success)' : 'var(--status-danger)';

  return (
    <div
      role="status"
      style={{
        background: ok ? 'rgba(45,161,49,0.07)' : 'rgba(194,66,66,0.06)',
        border: '1px solid ' + (ok ? 'rgba(45,161,49,0.35)' : 'rgba(194,66,66,0.35)'),
        borderRadius: 'var(--radius-lg)',
        padding: compact ? '16px 18px' : '20px 22px',
      }}
    >
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        <span
          style={{
            flex: 'none',
            width: 30,
            height: 30,
            borderRadius: 999,
            background: teinte,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icone nom={ok ? 'check' : 'close'} taille={17} epaisseur={2.2} />
        </span>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: compact ? 22 : 26,
            lineHeight: 1.18,
            color: 'var(--text-heading)',
            textWrap: 'pretty',
          }}
        >
          {titre}
        </span>
      </div>
      <div
        style={{
          marginTop: 'var(--space-4)',
          fontSize: compact ? 'var(--body-sm-size)' : 'var(--body-md-size)',
          lineHeight: 1.6,
          color: 'var(--neutral-80)',
          textWrap: 'pretty',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ progression */

export function Jauge({
  valeur,
  ton = 'var(--neutral-100)',
  hauteur = 6,
}: {
  valeur: number;
  ton?: string;
  hauteur?: number;
}) {
  const borne = Math.max(0, Math.min(100, valeur));

  return (
    <div
      style={{
        height: hauteur,
        borderRadius: 999,
        background: 'var(--neutral-20)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${borne}%`,
          height: '100%',
          borderRadius: 999,
          background: ton,
          transition: 'width var(--duration-slow) var(--ease-out)',
        }}
      />
    </div>
  );
}

/**
 * Avancement dans la série : un segment par question, vert ou rouge une fois
 * répondue, encre pour celle en cours. On ne compte pas seulement, on montre
 * où l'on en est — et le score se lit sans attendre la fin.
 */
export function ProgressionSerie({
  total,
  courante,
  resultats,
}: {
  total: number;
  courante: number;
  /** Index de question vers résultat. Absent tant qu'elle n'est pas répondue. */
  resultats: Record<number, 'ok' | 'ko'>;
}) {
  return (
    <div
      style={{ display: 'flex', gap: 4, width: '100%' }}
      role="img"
      aria-label={`Question ${courante + 1} sur ${total}`}
    >
      {Array.from({ length: total }).map((_, index) => {
        const resultat = resultats[index];
        const fond =
          resultat === 'ok'
            ? 'var(--status-success)'
            : resultat === 'ko'
              ? 'var(--status-danger)'
              : index === courante
                ? 'var(--neutral-100)'
                : 'var(--neutral-30)';

        return (
          <span
            key={index}
            style={{ flex: 1, height: 4, borderRadius: 999, background: fond }}
          />
        );
      })}
    </div>
  );
}

/**
 * Forme de la marque, teintée par le public de la formation. Le repère d'une
 * formation est sa forme, jamais une puce colorée — règle du système.
 */
export function FormeFormation({
  fichier,
  taille = 26,
}: {
  fichier: string;
  taille?: number;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={`/formes/${fichier}`}
      alt=""
      width={taille}
      height={taille}
      style={{ display: 'block', flex: 'none', objectFit: 'contain' }}
    />
  );
}

/**
 * « À l'argumentaire » — l'angle de vente, à côté du pourquoi.
 *
 * **Deux choses différentes, et c'est l'objectif métier.** Le verdict dit
 * pourquoi la réponse est juste ; cette carte dit quoi en faire au téléphone.
 * Le commercial ne vient pas seulement vérifier qu'il avait raison, il vient
 * chercher la phrase qu'il redira à l'appel suivant.
 *
 * **Elle ne s'affiche pas quand elle est vide.** Une question de fait n'a pas
 * d'angle de vente, et une carte vide ou remplie de généralités apprend à
 * sauter la carte.
 */
export function Argumentaire({ children }: { children: ReactNode }) {
  return (
    <Carte rayon="var(--radius-lg)" rembourrage="16px 18px" elevation="petite">
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icone nom="target" taille={16} couleur="var(--accent-primary)" />
        <span
          style={{
            fontSize: 'var(--body-sm-size)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-heading)',
          }}
        >
          À l’argumentaire
        </span>
      </span>
      <p
        style={{
          margin: 0,
          fontSize: 'var(--body-sm-size)',
          lineHeight: 1.6,
          color: 'var(--neutral-70)',
          textWrap: 'pretty',
        }}
      >
        {children}
      </p>
    </Carte>
  );
}

/**
 * Qui a écrit l'explication, et quand elle a changé.
 *
 * **La date dit quand l'explication a changé, pas quand la question a été
 * touchée.** Une correction de faute de frappe ne la fait pas bouger — c'est
 * garanti par les règles, pas seulement par le code qui écrit. Sans cela,
 * « mise à jour le 3 mars » sur un changement de virgule n'apprendrait rien.
 *
 * Le nom est recopié sur la question par celle qui l'écrit : `users/{uid}` est
 * fermé sans exception administrateur, et une question n'a pas le droit d'y
 * aller chercher un nom.
 *
 * Rend `null` quand il n'y a ni nom ni date — les questions écrites avant ce
 * lot n'en portent pas, et une signature vide ne vaut pas d'être affichée.
 */
export function SignatureExplication({
  auteur,
  majLe,
}: {
  auteur: string;
  majLe: Date | null;
}) {
  const nom = auteur.trim();
  if (!nom && !majLe) return null;

  const date = majLe
    ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(majLe)
    : null;

  return (
    <Meta style={{ display: 'block', fontSize: 11 }}>
      {nom ? `Explication rédigée par ${nom}` : 'Explication'}
      {date ? ` · mise à jour le ${date}` : ''}
    </Meta>
  );
}
