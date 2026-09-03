import type { ReactNode } from 'react';

import { Icone, type NomIcone } from '@/composants/ds/Icone';

/**
 * États vides, chargement et erreur.
 *
 * Ce sont des écrans à part entière, dessinés dans le système. Une erreur dit
 * ce qui s'est passé et quoi faire — elle ne s'excuse pas. Un état vide invite,
 * il ne constate pas.
 */

/** État vide pleine largeur : un titre en serif, une phrase, une action. */
export function EtatVide({
  icone,
  titre,
  texte,
  actions,
}: {
  icone: NomIcone;
  titre: string;
  texte: string;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        background: 'var(--surface-card)',
        borderRadius: 'var(--radius-xl)',
        padding: '28px',
        boxShadow: 'var(--shadow-card)',
        display: 'flex',
        gap: 'var(--space-5)',
        alignItems: 'center',
      }}
    >
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
        <Icone nom={icone} taille={22} couleur="var(--neutral-70)" />
      </span>
      <span style={{ flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            lineHeight: 1.2,
            color: 'var(--text-heading)',
          }}
        >
          {titre}
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
          {texte}
        </p>
      </span>
      {actions && (
        <span style={{ flex: 'none', display: 'flex', gap: 10 }}>{actions}</span>
      )}
    </div>
  );
}

/** Chargement : des squelettes, aucune animation d'apparition. */
export function Squelettes({ lignes = 5 }: { lignes?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-busy="true">
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        Chargement en cours.
      </span>
      {Array.from({ length: lignes }).map((_, index) => (
        <div
          key={index}
          style={{
            background: 'var(--surface-card)',
            borderRadius: 'var(--radius-lg)',
            padding: '18px 20px',
            boxShadow: 'var(--shadow-card-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <span style={{ flex: 1 }}>
            <span
              style={{
                display: 'block',
                width: index % 2 === 1 ? '52%' : '68%',
                height: 11,
                borderRadius: 4,
                background: 'var(--neutral-20)',
              }}
            />
            <span
              style={{
                display: 'block',
                marginTop: 9,
                width: '32%',
                height: 9,
                borderRadius: 4,
                background: 'var(--surface-page)',
              }}
            />
          </span>
          <span
            style={{
              flex: 'none',
              width: 120,
              height: 5,
              borderRadius: 999,
              background: 'var(--neutral-20)',
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** Erreur : ce qui s'est passé, ce qui est préservé, et quoi faire. */
export function EtatErreur({
  titre,
  texte,
  action,
}: {
  titre: string;
  texte: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      style={{
        background: 'rgba(194,66,66,0.06)',
        border: '1px solid rgba(194,66,66,0.3)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px 22px',
        display: 'flex',
        gap: 16,
        alignItems: 'center',
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          flex: 'none',
          borderRadius: 999,
          background: 'var(--status-danger)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icone nom="alert" taille={16} couleur="#fff" epaisseur={2} />
      </span>
      <span style={{ flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--body-md-size)',
            fontWeight: 600,
            color: 'var(--text-heading)',
          }}
        >
          {titre}
        </span>
        <span
          style={{
            display: 'block',
            marginTop: 4,
            fontSize: 'var(--body-sm-size)',
            lineHeight: 1.55,
            color: 'var(--neutral-70)',
          }}
        >
          {texte}
        </span>
      </span>
      {action && <span style={{ flex: 'none' }}>{action}</span>}
    </div>
  );
}

/** Confirmation discrète, sur fond d'encre. */
export function Confirmation({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--brand-ink)',
        color: '#fff',
        borderRadius: 'var(--radius-md)',
        padding: '13px 18px',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <Icone nom="check" taille={16} couleur="var(--specialty-others)" epaisseur={2.2} />
      <span style={{ fontSize: 'var(--body-sm-size)' }}>{children}</span>
    </div>
  );
}
