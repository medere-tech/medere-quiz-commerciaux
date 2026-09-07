'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { Icone, type NomIcone } from '@/composants/ds/Icone';
import { seDeconnecter } from '@/lib/auth/connexion-client';

/**
 * Coquille du back-office : navigation et zone de travail.
 *
 * **Trois états, un seul composant.** Au bureau, la barre latérale est
 * permanente et se replie aux icônes seules — un standard des outils
 * professionnels, et la place rendue compte quand on balaie deux cents
 * questions. Sous 900 pixels, elle passe en tiroir : Noémie ne rédige pas sur
 * un téléphone, mais elle y vérifie une question, consulte des statistiques
 * avant la session du jeudi, lance une synchronisation depuis un train. Un
 * outil qu'on ne peut ouvrir qu'à son bureau finit par ne plus s'ouvrir.
 *
 * **Le repli est retenu dans un témoin de connexion, pas dans `localStorage`.**
 * Le projet s'interdit les stockages du navigateur ; un témoin a en plus
 * l'avantage d'être lu par le serveur, donc la barre s'affiche déjà dans le
 * bon état au premier rendu, sans battement.
 *
 * La bascule de mise en page, elle, vit dans la feuille de style : une
 * requête de média n'a pas besoin de JavaScript, et ne peut pas se tromper
 * entre le rendu serveur et le navigateur.
 */

/** Témoin de préférence, sans donnée personnelle. Un an. */
const TEMOIN_BARRE = 'medere-barre';

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

/** Les initiales, seules, quand la barre est repliée. */
function Initiales({ nom }: { nom: string }) {
  const initiales = nom
    .split(' ')
    .map((mot) => mot[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      aria-hidden="true"
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
  barreReduite = false,
  children,
}: {
  nom: string;
  /** État du repli au premier rendu, lu du témoin par le serveur. */
  barreReduite?: boolean;
  children: ReactNode;
}) {
  const chemin = usePathname();
  const [reduite, setReduite] = useState(barreReduite);
  const [tiroirOuvert, setTiroirOuvert] = useState(false);

  // Échap referme, comme tout ce qui se superpose à une page.
  useEffect(() => {
    if (!tiroirOuvert) return;
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') setTiroirOuvert(false);
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [tiroirOuvert]);

  function basculerRepli() {
    const suivant = !reduite;
    setReduite(suivant);
    document.cookie = `${TEMOIN_BARRE}=${suivant ? 'reduite' : 'etendue'}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <div className="coquille">
      <header className="coquille-entete">
        <button
          type="button"
          className="coquille-menu"
          aria-label="Ouvrir la navigation"
          aria-expanded={tiroirOuvert}
          onClick={() => setTiroirOuvert(true)}
          style={boutonIcone}
        >
          <Icone nom="table" taille={20} />
        </button>
        <Marque />
      </header>

      {tiroirOuvert && (
        <button
          type="button"
          className="coquille-voile"
          aria-label="Fermer la navigation"
          onClick={() => setTiroirOuvert(false)}
        />
      )}

      <nav
        className="coquille-nav"
        data-reduite={reduite ? 'true' : 'false'}
        data-ouvert={tiroirOuvert ? 'true' : 'false'}
        aria-label="Sections du back-office"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 8px',
          }}
        >
          {/* La marque disparaît quand la barre est repliée — mais elle
              revient dans le tiroir, où la place ne manque pas. C'est la
              feuille de style qui en décide, pas le composant : lui ne sait
              pas s'il est affiché en tiroir ou en colonne. */}
          {/* Sans `display` en ligne : c'est la feuille de style qui le
              masque au repli, et un style en ligne l'emporterait sur elle. */}
          <span className="coquille-libelle" style={{ flex: 1 }}>
            <Marque />
          </span>

          <button
            type="button"
            className="coquille-repli"
            onClick={basculerRepli}
            aria-label={reduite ? 'Étendre la navigation' : 'Réduire la navigation'}
            title={reduite ? 'Étendre la navigation' : 'Réduire la navigation'}
            style={boutonIcone}
          >
            {/* Un seul chevron dans le jeu d'icônes : on le retourne plutôt
                que d'en dessiner un second. */}
            <span
              style={{
                display: 'flex',
                transform: reduite ? 'none' : 'rotate(180deg)',
                transition: 'var(--transition-base)',
              }}
            >
              <Icone nom="chevronRight" taille={16} />
            </span>
          </button>

          <button
            type="button"
            className="coquille-fermer"
            onClick={() => setTiroirOuvert(false)}
            aria-label="Fermer la navigation"
            style={boutonIcone}
          >
            <Icone nom="close" taille={18} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAVIGATION.map((entree) => {
            const actif =
              chemin === entree.chemin || chemin.startsWith(`${entree.chemin}/`);
            const contenu = (
              <>
                <Icone nom={entree.icone} taille={18} />
                {/* Le libellé est masqué par la feuille de style quand la
                    barre est repliée, jamais retiré du document : un lecteur
                    d'écran doit continuer à lire le nom de la section. */}
                <span className="coquille-libelle" style={{ flex: 1 }}>
                  {entree.libelle}
                </span>
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
                  title={
                    reduite
                      ? `${entree.libelle} — disponible à un prochain lot`
                      : 'Disponible à un prochain lot'
                  }
                  style={{ ...style, opacity: 0.4, cursor: 'not-allowed' }}
                >
                  {contenu}
                </span>
              );
            }

            return (
              <Link
                key={entree.chemin}
                href={entree.route}
                title={reduite ? entree.libelle : undefined}
                // Changer d'écran referme le tiroir : le laisser ouvert
                // masquerait la page qu'on vient de demander.
                onClick={() => setTiroirOuvert(false)}
                style={style}
              >
                {contenu}
              </Link>
            );
          })}
        </div>
        <div style={{ marginTop: 'auto' }}>
          <span className="coquille-libelle">
            <PastilleUtilisateur nom={nom} role="Responsable pédagogique" />
          </span>
          <span className="coquille-initiales" title={nom}>
            <Initiales nom={nom} />
          </span>
        </div>
      </nav>
      <main className="coquille-contenu">{children}</main>
    </div>
  );
}

/**
 * Sans `display` : ces boutons paraissent ou disparaissent selon la largeur,
 * et un style en ligne l'emporterait sur la requête de média. La feuille de
 * style garde donc la main dessus.
 */
const boutonIcone = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: 6,
  borderRadius: 'var(--radius-sm)',
  color: 'var(--neutral-60)',
  flex: 'none',
} as const;
