'use client';

import type { CSSProperties, ReactNode } from 'react';

import { Icone } from '@/composants/ds/Icone';

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
