'use client';

import Link from 'next/link';
import type { Route } from 'next';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Les écrans de limite : une panne, une page introuvable.
 *
 * **Pourquoi ils existent, alors que le système avait déjà `EtatErreur`.** Il
 * l'avait, et aucune frontière d'erreur ne s'en servait : le dépôt ne portait
 * ni `error.tsx`, ni `global-error.tsx`, ni `not-found.tsx`. Une panne dans une
 * page rendait donc l'écran par défaut de Next — en production, « Application
 * error: a server-side exception has occurred » sur fond blanc, en anglais,
 * sans marque et sans issue. C'est l'exact contraire de la règle du projet :
 * une erreur dit ce qui s'est passé et quoi faire, elle ne s'excuse pas.
 *
 * **Pourquoi ce module n'importe ni `primitives` ni `etats`, alors qu'ils
 * dessinent exactement ces blocs.** Une frontière d'erreur est un composant
 * client, et celle de la racine enveloppe **toutes** les routes : ce qu'elle
 * importe entre dans le fragment initial de chaque écran. La première version
 * s'appuyait sur `EtatErreur` et `Bouton` — mesuré, cela coûtait **16,6 ko
 * transférés sur chaque écran**, écran de connexion compris, pour un écran que
 * presque personne ne verra. C'est mot pour mot le cas nommé dans
 * `CLAUDE.md` : « aucune ressource lourde sur un écran qui ne s'en sert pas ».
 *
 * **Ce n'est pas une palette parallèle.** Les valeurs ci-dessous sont les
 * jetons du système — `--status-danger`, `--radius-lg`, `--space-*`, la même
 * pilule, la même carte. Rien n'est inventé : seule la dépendance de module est
 * coupée, parce qu'elle se paie sur des écrans qui ne s'en servent pas. Si ces
 * blocs doivent changer d'allure, ils changent avec le reste, ici aussi.
 *
 * **Le digest est affiché, et ce n'est pas un détail technique laissé en
 * vitrine.** En production, Next n'envoie au navigateur ni le message ni la
 * pile — seulement cet identifiant, le même que celui écrit dans les journaux
 * du serveur. C'est la seule chose qu'un commercial puisse lire à voix haute
 * pour qu'on retrouve sa panne. Sans lui, « ça n'a pas marché » est tout ce
 * dont on dispose, et l'on cherche à l'aveugle — ce qui a déjà coûté deux
 * déploiements sur ce projet.
 */

/** La pilule du système, dans ses deux variantes utilisées ici. */
const PILULE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '11px 20px',
  fontFamily: 'inherit',
  fontSize: 'var(--body-md-size)',
  fontWeight: 600,
  lineHeight: 1.2,
  borderRadius: 999,
  cursor: 'pointer',
  textDecoration: 'none',
  border: '1px solid transparent',
};

const PILULE_PRIMAIRE: CSSProperties = {
  ...PILULE,
  background: 'var(--neutral-100)',
  color: 'var(--text-inverse)',
  boxShadow: 'var(--shadow-pill)',
};

const PILULE_SECONDAIRE: CSSProperties = {
  ...PILULE,
  background: 'var(--surface-card)',
  color: 'var(--text-heading)',
  borderColor: 'var(--neutral-20)',
};

export function EcranDePanne({
  reessayer,
  digest,
  titre = 'L’écran n’a pas pu se charger',
  texte,
  retour,
}: {
  reessayer: () => void;
  digest?: string;
  titre?: string;
  texte: string;
  /** Sortie de secours quand réessayer ne suffit pas. */
  retour?: { route: Route; libelle: string };
}) {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(20px, 3.2vw, 36px) clamp(16px, 3.2vw, 40px)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div
          role="alert"
          style={{
            background: 'rgba(194,66,66,0.06)',
            border: '1px solid rgba(194,66,66,0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 22px',
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              background: 'var(--status-danger)',
            }}
          >
            {/* Le même tracé que l'icône `alert` du système, en ligne. */}
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 4l8.5 15h-17zM12 10v4.2M12 16.6v.2"
                stroke="#fff"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          <h1
            style={{
              margin: 'var(--space-4) 0 0',
              fontSize: 'var(--body-lg-size)',
              fontWeight: 600,
              lineHeight: 1.25,
              color: 'var(--text-heading)',
              textWrap: 'pretty',
            }}
          >
            {titre}
          </h1>

          <p
            style={{
              margin: '6px 0 0',
              fontSize: 'var(--body-sm-size)',
              lineHeight: 1.55,
              color: 'var(--neutral-70)',
            }}
          >
            {texte}
          </p>

          <div
            style={{
              marginTop: 'var(--space-5)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <button type="button" onClick={reessayer} style={PILULE_PRIMAIRE}>
              Réessayer
            </button>
            {retour && (
              <Link href={retour.route} style={PILULE_SECONDAIRE}>
                {retour.libelle}
              </Link>
            )}
          </div>
        </div>

        {digest && <Reference digest={digest} />}
      </div>
    </div>
  );
}

/**
 * La référence de la panne.
 *
 * Discrète — elle ne s'adresse pas au commercial qui veut juste continuer —
 * mais lisible et sélectionnable d'un geste, parce que c'est elle qu'on
 * demandera.
 */
function Reference({ digest }: { digest: string }) {
  return (
    <p
      style={{
        margin: 'var(--space-4) 0 0',
        fontSize: 'var(--body-sm-size)',
        color: 'var(--neutral-70)',
        textAlign: 'center',
      }}
    >
      Si cela se reproduit, signalez cette référence :{' '}
      <span style={{ fontVariantNumeric: 'tabular-nums', userSelect: 'all', fontWeight: 600 }}>
        {digest}
      </span>
    </p>
  );
}

/**
 * Page introuvable : un état vide, pas une erreur.
 *
 * Rien n'est cassé — une adresse a été mal tapée, ou un écran a été retiré
 * depuis qu'un lien a été mis en favori. Le rouge d'alerte serait une
 * exagération, et la règle du projet est qu'un état vide invite au lieu de
 * constater : on propose la sortie, la seule chose utile ici.
 */
export function EcranIntrouvable() {
  return (
    <Cadre>
      <div
        style={{
          background: 'var(--surface-card)',
          borderRadius: 'var(--radius-xl)',
          padding: 28,
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 999,
            background: 'var(--surface-page)',
          }}
        >
          {/* Le tracé de l'icône `search` du système. */}
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M11 4a7 7 0 100 14 7 7 0 000-14zM16.2 16.2L21 21"
              stroke="var(--text-heading)"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <h1
          style={{
            margin: '18px 0 0',
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(22px, 5vw, 26px)',
            lineHeight: 1.15,
            color: 'var(--text-heading)',
          }}
        >
          Cette page n’existe pas
        </h1>

        <p
          style={{
            margin: '8px 0 0',
            fontSize: 'var(--body-md-size)',
            lineHeight: 1.55,
            color: 'var(--neutral-70)',
          }}
        >
          L’adresse est peut-être incomplète, ou l’écran a été retiré depuis que vous l’avez
          enregistré.
        </p>

        <Link href="/" style={{ ...PILULE_PRIMAIRE, marginTop: 'var(--space-5)' }}>
          Revenir à l’accueil
        </Link>
      </div>
    </Cadre>
  );
}

/** Enveloppe centrée, pour les écrans de limite qui n'ont pas de coquille. */
export function Cadre({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--surface-page)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(20px, 3.2vw, 36px) clamp(16px, 3.2vw, 40px)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 560 }}>{children}</div>
    </div>
  );
}
