'use client';

import {
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';

/**
 * Primitives du système de design Médéré, transposées du bundle Claude Design.
 *
 * Les valeurs — rembourrages, rayons, ombres, états — sont celles du système,
 * pas des approximations. Un composant qui manque ici se demande au design ;
 * on n'en invente pas.
 */

/* ------------------------------------------------------------------ Bouton */

const TAILLES_BOUTON = {
  sm: { padding: '8px 14px', fontSize: 'var(--body-sm-size)' },
  md: { padding: '11px 20px', fontSize: 'var(--body-md-size)' },
  lg: { padding: '14px 26px', fontSize: 'var(--body-lg-size)' },
} as const;

const VARIANTES_BOUTON = {
  primaire: {
    background: 'var(--neutral-100)',
    color: 'var(--text-inverse)',
    border: '1px solid transparent',
    boxShadow: 'var(--shadow-pill)',
  },
  accent: {
    background: 'var(--accent-primary)',
    color: 'var(--text-inverse)',
    border: '1px solid transparent',
  },
  secondaire: {
    background: 'var(--surface-card)',
    color: 'var(--text-heading)',
    border: '1px solid var(--border-default)',
  },
  fantome: {
    background: 'transparent',
    color: 'var(--text-heading)',
    border: '1px solid transparent',
  },
  soulignee: {
    background: 'var(--accent-highlight)',
    color: 'var(--neutral-100)',
    border: '1px solid transparent',
  },
  inverse: {
    background: 'var(--surface-inverse)',
    color: 'var(--text-inverse)',
    border: '1px solid transparent',
  },
} as const;

type ProprietesBouton = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: keyof typeof VARIANTES_BOUTON;
  taille?: keyof typeof TAILLES_BOUTON;
  pleineLargeur?: boolean;
  iconeGauche?: ReactNode;
  iconeDroite?: ReactNode;
};

export function Bouton({
  children,
  variante = 'primaire',
  taille = 'md',
  pleineLargeur = false,
  iconeGauche,
  iconeDroite,
  disabled = false,
  style,
  ...reste
}: ProprietesBouton) {
  const [survol, setSurvol] = useState(false);
  const [appui, setAppui] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => {
        setSurvol(false);
        setAppui(false);
      }}
      onMouseDown={() => setAppui(true)}
      onMouseUp={() => setAppui(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
        fontFamily: 'var(--font-sans)',
        fontWeight: 'var(--weight-semibold)',
        lineHeight: 1,
        borderRadius: 'var(--radius-full)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'var(--transition-base)',
        width: pleineLargeur ? '100%' : undefined,
        opacity: disabled ? 0.4 : 1,
        transform: appui && !disabled ? 'scale(0.98)' : 'scale(1)',
        filter: survol && !disabled ? 'brightness(0.94)' : 'none',
        ...TAILLES_BOUTON[taille],
        ...VARIANTES_BOUTON[variante],
        ...style,
      }}
      {...reste}
    >
      {iconeGauche}
      <span>{children}</span>
      {iconeDroite}
    </button>
  );
}

/* ------------------------------------------------------------------- Carte */

const OMBRES = {
  carte: 'var(--shadow-card)',
  petite: 'var(--shadow-card-sm)',
  haute: 'var(--shadow-raised)',
  aucune: 'none',
} as const;

export function Carte({
  children,
  rembourrage = 'var(--gutter-card)',
  rayon = 'var(--radius-xl)',
  elevation = 'carte',
  bordee = false,
  style,
}: {
  children: ReactNode;
  rembourrage?: string | number;
  rayon?: string;
  elevation?: keyof typeof OMBRES;
  bordee?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: 'var(--surface-card)',
        borderRadius: rayon,
        padding: rembourrage,
        // Bordure et ombre sont des alternatives, jamais des compagnes.
        boxShadow: bordee ? 'none' : OMBRES[elevation],
        border: bordee ? '1px solid var(--border-subtle)' : 'none',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- Étiquette */

export function Etiquette({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 8px',
        borderRadius: 'var(--radius-xs)',
        background: 'var(--surface-chip)',
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-sans)',
        fontWeight: 'var(--weight-semibold)',
        fontSize: 'var(--tag-size)',
        lineHeight: 'var(--tag-lh)',
        letterSpacing: 'var(--tag-tracking)',
        textTransform: 'uppercase',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

const TONS_STATUT = {
  brouillon: { background: 'var(--surface-chip)', color: 'var(--neutral-70)' },
  publiee: { background: 'rgba(45,161,49,0.13)', color: 'var(--status-success-texte)' },
  attention: { background: 'rgba(254,202,69,0.30)', color: 'var(--neutral-80)' },
  erreur: { background: 'rgba(194,66,66,0.11)', color: 'var(--status-danger-texte)' },
  info: { background: 'rgba(0,110,144,0.11)', color: 'var(--accent-primary)' },
} as const;

export function EtiquetteStatut({
  ton = 'brouillon',
  children,
}: {
  ton?: keyof typeof TONS_STATUT;
  children: ReactNode;
}) {
  return (
    <Etiquette
      style={{
        padding: '4px 9px',
        borderRadius: 'var(--radius-sm)',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.06em',
        ...TONS_STATUT[ton],
      }}
    >
      {children}
    </Etiquette>
  );
}

/* ------------------------------------------------------------------- Champ */

export function Champ({
  label,
  aide,
  erreur,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  prefixe,
  suffixe,
  style,
  ref,
  ...reste
}: {
  label?: ReactNode;
  aide?: ReactNode;
  erreur?: string;
  value: string;
  onChange: (valeur: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  prefixe?: ReactNode;
  suffixe?: ReactNode;
  style?: CSSProperties;
  ref?: Ref<HTMLInputElement>;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value' | 'style' | 'prefix' | 'ref'
>) {
  const [focus, setFocus] = useState(false);

  return (
    <label style={{ display: 'block', fontFamily: 'var(--font-sans)', ...style }}>
      {label && (
        <span
          style={{
            display: 'block',
            fontSize: 'var(--body-sm-size)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-heading)',
            marginBottom: 'var(--space-2)',
          }}
        >
          {label}
        </span>
      )}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          background: disabled ? 'var(--surface-sunken)' : 'var(--surface-card)',
          border:
            '1px solid ' +
            (erreur
              ? 'var(--status-danger)'
              : focus
                ? 'var(--focus-ring)'
                : 'var(--border-default)'),
          boxShadow: focus ? 'var(--focus-halo)' : 'none',
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
          transition: 'var(--transition-base)',
        }}
      >
        {prefixe}
        <input
          ref={ref}
          type={type}
          value={value}
          onChange={(evenement) => onChange(evenement.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          aria-invalid={erreur ? true : undefined}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            minWidth: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--body-md-size)',
            color: 'var(--text-body)',
          }}
          {...reste}
        />
        {suffixe}
      </span>
      {(aide || erreur) && (
        <span
          style={{
            display: 'block',
            marginTop: 'var(--space-2)',
            fontSize: 'var(--body-xs-size)',
            lineHeight: 1.45,
            color: erreur ? 'var(--status-danger-texte)' : 'var(--text-muted)',
          }}
        >
          {erreur || aide}
        </span>
      )}
    </label>
  );
}

/* ------------------------------------------------------------ Zone de texte */

export function ZoneDeTexte({
  label,
  aide,
  erreur,
  value,
  onChange,
  placeholder,
  lignes = 3,
  mono = false,
  style,
}: {
  label?: ReactNode;
  aide?: ReactNode;
  erreur?: string;
  value: string;
  onChange: (valeur: string) => void;
  placeholder?: string;
  lignes?: number;
  /**
   * Chasse fixe, pour un contenu où l'alignement des colonnes porte du sens :
   * un tableau collé se relit à la verticale, pas à la ligne.
   */
  mono?: boolean;
  style?: CSSProperties;
}) {
  const [focus, setFocus] = useState(false);

  return (
    <label style={{ display: 'block', fontFamily: 'var(--font-sans)', ...style }}>
      {label && (
        <span
          style={{
            display: 'block',
            fontSize: 'var(--body-sm-size)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-heading)',
            marginBottom: 'var(--space-2)',
          }}
        >
          {label}
        </span>
      )}
      <textarea
        value={value}
        rows={lignes}
        placeholder={placeholder}
        onChange={(evenement) => onChange(evenement.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        aria-invalid={erreur ? true : undefined}
        style={{
          display: 'block',
          width: '100%',
          resize: 'vertical',
          background: 'var(--surface-card)',
          border:
            '1px solid ' +
            (erreur
              ? 'var(--status-danger)'
              : focus
                ? 'var(--focus-ring)'
                : 'var(--border-default)'),
          boxShadow: focus ? 'var(--focus-halo)' : 'none',
          borderRadius: 'var(--radius-md)',
          padding: '11px 14px',
          outline: 'none',
          fontFamily: mono
            ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
            : 'var(--font-sans)',
          fontSize: mono ? 12.5 : 'var(--body-md-size)',
          lineHeight: 1.55,
          color: 'var(--text-body)',
          transition: 'var(--transition-base)',
          whiteSpace: mono ? 'pre' : undefined,
          overflowX: mono ? 'auto' : undefined,
        }}
      />
      {(aide || erreur) && (
        <span
          style={{
            display: 'block',
            marginTop: 'var(--space-2)',
            fontSize: 'var(--body-xs-size)',
            lineHeight: 1.45,
            color: erreur ? 'var(--status-danger-texte)' : 'var(--text-secondary)',
          }}
        >
          {erreur || aide}
        </span>
      )}
    </label>
  );
}

/* --------------------------------------------------------------- Sélecteur */

export function Selecteur({
  label,
  options,
  value,
  onChange,
  disabled,
  style,
}: {
  label?: ReactNode;
  options: { valeur: string; libelle: string }[];
  value: string;
  onChange: (valeur: string) => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const [focus, setFocus] = useState(false);

  return (
    <label style={{ display: 'block', fontFamily: 'var(--font-sans)', ...style }}>
      {label && (
        <span
          style={{
            display: 'block',
            fontSize: 'var(--body-sm-size)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-heading)',
            marginBottom: 'var(--space-2)',
          }}
        >
          {label}
        </span>
      )}
      <select
        value={value}
        disabled={disabled}
        onChange={(evenement) => onChange(evenement.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: '100%',
          appearance: 'none',
          background: 'var(--surface-card)',
          backgroundImage:
            'linear-gradient(45deg,transparent 50%,var(--text-secondary) 50%),' +
            'linear-gradient(135deg,var(--text-secondary) 50%,transparent 50%)',
          backgroundPosition: 'calc(100% - 18px) 50%,calc(100% - 13px) 50%',
          backgroundSize: '5px 5px,5px 5px',
          backgroundRepeat: 'no-repeat',
          border: '1px solid ' + (focus ? 'var(--focus-ring)' : 'var(--border-default)'),
          boxShadow: focus ? 'var(--focus-halo)' : 'none',
          borderRadius: 'var(--radius-md)',
          padding: '11px 36px 11px 14px',
          outline: 'none',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--body-md-size)',
          color: 'var(--text-body)',
          transition: 'var(--transition-base)',
        }}
      >
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ----------------------------------------------------------------- Onglets */

export function Onglets<T extends string>({
  items,
  valeur,
  onChange,
  style,
}: {
  items: { valeur: T; libelle: string }[];
  valeur: T;
  onChange: (valeur: T) => void;
  style?: CSSProperties;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: 'inline-flex',
        gap: 'var(--space-1)',
        background: 'var(--surface-sunken)',
        padding: 4,
        borderRadius: 'var(--radius-full)',
        flex: 'none',
        ...style,
      }}
    >
      {items.map((item) => {
        const actif = item.valeur === valeur;
        return (
          <button
            key={item.valeur}
            type="button"
            role="tab"
            aria-selected={actif}
            onClick={() => onChange(item.valeur)}
            style={{
              border: 'none',
              cursor: 'pointer',
              padding: '8px 18px',
              borderRadius: 'var(--radius-full)',
              background: actif ? 'var(--surface-card)' : 'transparent',
              boxShadow: actif ? 'var(--shadow-card-sm)' : 'none',
              fontFamily: 'var(--font-sans)',
              fontWeight: 'var(--weight-semibold)',
              fontSize: 'var(--body-sm-size)',
              color: actif ? 'var(--text-heading)' : 'var(--text-secondary)',
              transition: 'var(--transition-base)',
              whiteSpace: 'nowrap',
            }}
          >
            {item.libelle}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------- micro-typographie */

export function Meta({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span style={{ fontSize: 'var(--body-sm-size)', color: 'var(--text-secondary)', ...style }}>
      {children}
    </span>
  );
}

export function Touche({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 20,
        height: 20,
        padding: '0 5px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-chip)',
        border: '1px solid var(--border-default)',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-secondary)',
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}

export function TitrePage({
  titre,
  sous,
  actions,
}: {
  titre: string;
  sous?: string;
  actions?: ReactNode;
}) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 'var(--space-8)',
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 34,
            lineHeight: 1.12,
            color: 'var(--text-heading)',
          }}
        >
          {titre}
        </h1>
        {sous && (
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 'var(--body-md-size)',
              color: 'var(--text-secondary)',
              maxWidth: 620,
              textWrap: 'pretty',
            }}
          >
            {sous}
          </p>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flex: 'none' }}>
          {actions}
        </div>
      )}
    </header>
  );
}

export function TitreSection({ children, indice }: { children: ReactNode; indice?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
      <h2
        style={{
          margin: 0,
          fontSize: 'var(--heading-sm-size)',
          fontWeight: 600,
          color: 'var(--text-heading)',
        }}
      >
        {children}
      </h2>
      {indice && <Meta>{indice}</Meta>}
    </div>
  );
}
