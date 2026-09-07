'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { Icone, type NomIcone } from '@/composants/ds/Icone';
import { seDeconnecter } from '@/lib/auth/connexion-client';

/**
 * Coquille du back-office : navigation latérale permanente et zone de travail.
 *
 * Le parcours commercial passera en mode focus au lot 5 ; ici on balaie deux
 * cents questions, la navigation reste sous la main. Mêmes jetons, deux
 * densités — c'est la direction visuelle du système.
 */

type Entree = {
  libelle: string;
  icone: NomIcone;
  chemin: string;
  /**
   * Seules les entrées livrées portent une route. Les autres figurent dans la
   * maquette et attendent leur lot : elles restent visibles mais inertes,
   * plutôt que de faire changer la navigation de forme à chaque livraison.
   */
  route?: Route;
};

const NAVIGATION: Entree[] = [
  {
    libelle: 'Banque de questions',
    icone: 'layers',
    chemin: '/admin/questions',
    route: '/admin/questions',
  },
  {
    libelle: 'Import en masse',
    icone: 'upload',
    chemin: '/admin/import',
    route: '/admin/import',
  },
  { libelle: 'Statistiques', icone: 'chart', chemin: '/admin/statistiques' },
  { libelle: 'Session collective', icone: 'presentation', chemin: '/admin/session' },
  {
    libelle: 'Formations',
    icone: 'book',
    chemin: '/admin/formations',
    route: '/admin/formations',
  },
];

function Marque() {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: 'var(--brand-ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Deux barres de la marque, tracées : le fichier logo n'est pas
            embarqué dans le dépôt. Voir README, section 7. */}
        <span style={{ display: 'flex', gap: 3 }}>
          <span style={{ width: 3, height: 13, borderRadius: 2, background: '#fff' }} />
          <span style={{ width: 3, height: 13, borderRadius: 2, background: '#fff' }} />
        </span>
      </span>
      <span
        style={{
          fontSize: 'var(--body-sm-size)',
          fontWeight: 600,
          letterSpacing: '0.01em',
          color: 'var(--text-heading)',
        }}
      >
        Entraînement
      </span>
    </span>
  );
}

function PastilleUtilisateur({ nom, role }: { nom: string; role: string }) {
  const routeur = useRouter();
  const initiales = nom
    .split(' ')
    .map((mot) => mot[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-page)',
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          flex: 'none',
          borderRadius: 999,
          background: 'var(--brand-ink)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {initiales}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--body-sm-size)',
            fontWeight: 600,
            color: 'var(--text-heading)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {nom}
        </span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)' }}>
          {role}
        </span>
      </span>
      <button
        type="button"
        aria-label="Se déconnecter"
        onClick={() => {
          // `refresh` fait rejouer la disposition serveur, qui relit le cookie
          // et rend l'écran de connexion.
          void seDeconnecter().then(() => routeur.refresh());
        }}
        style={{
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          padding: 4,
          color: 'var(--neutral-50)',
          display: 'flex',
        }}
      >
        <Icone nom="logout" taille={16} />
      </button>
    </span>
  );
}

export function CoquilleAdmin({
  nom,
  children,
}: {
  nom: string;
  children: ReactNode;
}) {
  const chemin = usePathname();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav
        style={{
          width: 232,
          flex: 'none',
          background: 'var(--surface-card)',
          padding: '22px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ padding: '0 8px' }}>
          <Marque />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAVIGATION.map((entree) => {
            const actif =
              chemin === entree.chemin || chemin.startsWith(`${entree.chemin}/`);
            const contenu = (
              <>
                <Icone nom={entree.icone} taille={18} />
                <span style={{ flex: 1 }}>{entree.libelle}</span>
              </>
            );
            const style = {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 10px',
              borderRadius: 'var(--radius-md)',
              background: actif ? 'var(--surface-chip)' : 'transparent',
              color: actif ? 'var(--text-heading)' : 'var(--neutral-60)',
              fontSize: 'var(--body-sm-size)',
              fontWeight: actif ? 600 : 400,
              textDecoration: 'none',
            } as const;

            if (!entree.route) {
              return (
                <span
                  key={entree.chemin}
                  title="Disponible à un prochain lot"
                  style={{ ...style, opacity: 0.4, cursor: 'not-allowed' }}
                >
                  {contenu}
                </span>
              );
            }

            return (
              <Link key={entree.chemin} href={entree.route} style={style}>
                {contenu}
              </Link>
            );
          })}
        </div>
        <div style={{ marginTop: 'auto' }}>
          <PastilleUtilisateur nom={nom} role="Responsable pédagogique" />
        </div>
      </nav>
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}
