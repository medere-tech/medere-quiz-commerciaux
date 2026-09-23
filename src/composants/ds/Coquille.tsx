'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Icone, type NomIcone } from '@/composants/ds/Icone';
import {
  useNombreDeQuestionsServies,
  useNombreDeRatees,
} from '@/lib/navigation/compteurs';
import { seDeconnecter } from '@/lib/auth/connexion-client';
import { Pastille } from '@/composants/session/Pastille';
import { useMonAvatar } from '@/lib/session/avatar-client';
import { usePanneauSuperpose } from '@/lib/navigation/panneau-superpose';

/**
 * Coquille applicative : navigation et zone de travail.
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

/**
 * Trois états, et non deux.
 *
 * Tant que personne n'a choisi, la barre est en « automatique » : c'est la
 * largeur qui décide, et la feuille de style s'en charge — repliée sur une
 * tablette en paysage, entière sur un grand écran. Dès que Noémie touche au
 * bouton, son choix l'emporte à toutes les largeurs : une préférence exprimée
 * ne se fait pas contredire par une rotation d'écran.
 */
type EtatBarre = 'auto' | 'reduite' | 'etendue';

export type Entree = {
  libelle: string;
  icone: NomIcone;
  chemin: string;
  /**
   * **Toute entrée mène quelque part.** Le type a longtemps rendu la route
   * facultative, pour des entrées dessinées par la maquette mais pas encore
   * livrées : elles paraissaient grisées, avec une infobulle qui disait
   * « disponible à un prochain lot ». Plus aucune n'était dans ce cas, la
   * branche ne s'affichait jamais, et son libellé faisait fuiter du
   * vocabulaire interne : un utilisateur ne sait pas ce qu'est un lot.
   */
  route: Route;
  /**
   * Nom du compteur à afficher au bout de la ligne, quand la maquette en pose
   * un. La coquille le calcule elle-même : une navigation qui attendrait le
   * chiffre de chaque écran ne l'aurait sur aucun.
   */
  compteur?: 'questionsServies' | 'ratees';
};

/**
 * Passage vers l'autre espace. Absent pour un commercial, qui n'a qu'un monde.
 */
export type Bascule = {
  route: Route;
  libelle: string;
  icone: NomIcone;
};

export const NAVIGATION_ADMIN: Entree[] = [
  {
    libelle: 'Banque de questions',
    icone: 'layers',
    chemin: '/admin/questions',
    route: '/admin/questions',
    compteur: 'questionsServies',
  },
  {
    libelle: 'Import en masse',
    icone: 'upload',
    chemin: '/admin/import',
    route: '/admin/import',
  },
  {
    libelle: 'Statistiques',
    icone: 'chart',
    chemin: '/admin/statistiques',
    route: '/admin/statistiques',
  },
  {
    libelle: 'Session collective',
    icone: 'presentation',
    // La préparation est un travail de back-office, dans la coquille ;
    // l'animation est un mode, projeté sur un mur, hors coquille. L'entrée mène
    // donc à la composition, qui offre de lancer.
    chemin: '/admin/session',
    route: '/admin/session',
  },
  {
    libelle: 'Formations',
    icone: 'book',
    chemin: '/admin/formations',
    route: '/admin/formations',
  },
];

/**
 * La marque, et le nom du monde où l'on se trouve.
 *
 * Le libellé était « Entraînement » dans les deux coquilles, y compris dans le
 * back-office. Nommer le contexte est la moitié du travail d'une bascule : on
 * ne sait pas qu'on peut passer ailleurs si l'on ne sait pas où l'on est.
 */
/**
 * Le signe de la marque : deux barres.
 *
 * **Tracé, et non servi.** Le fichier fourni par le design est un PNG de
 * 328 × 420 — deux barres blanches aux extrémités pleinement arrondies, rien
 * d'autre. Un dessin de cette nature se décrit en deux rectangles, et le
 * décrire vaut mieux que le servir : `public/` retombe sous le
 * `Cache-Control: max-age=0, must-revalidate` de Vercel, soit **un
 * aller-retour par visite sur tous les écrans authentifiés**, pour une marque
 * affichée à trente pixels. C'est exactement le défaut corrigé sur les polices
 * au lot de performance, et il ne se reprend pas ici.
 *
 * **Les proportions viennent du fichier, mesurées au pixel** : barres de 129
 * unités de large sur 405 de haut, séparées de 62, extrémités arrondies au
 * rayon de la demi-largeur. La boîte fait donc 320 × 405, et la maquette la
 * pose à 55 % du côté du pavé.
 */
function MarqueMedere({ hauteur }: { hauteur: number }) {
  return (
    <svg
      width={Math.round((hauteur * 320) / 405)}
      height={hauteur}
      viewBox="0 0 320 405"
      fill="#fff"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <rect x="0" y="0" width="129" height="405" rx="64.5" />
      <rect x="191" y="0" width="129" height="405" rx="64.5" />
    </svg>
  );
}

export function Marque({
  contexte,
  taille = 30,
  tailleLibelle = 'var(--body-sm-size)',
  fond = 'clair',
}: {
  contexte: string;
  /**
   * Côté du pavé, en pixels. Trente dans une barre latérale ; davantage sur
   * l'écran projeté de la salle d'attente, qui se lit à plusieurs mètres. Les
   * barres suivent proportionnellement.
   */
  taille?: number;
  tailleLibelle?: string;
  /**
   * Sur fond encre, le pavé plein disparaîtrait : il devient un carré translucide
   * et le libellé passe en blanc. C'est ce que fait la maquette de connexion.
   */
  fond?: 'clair' | 'encre';
}) {
  const surEncre = fond === 'encre';

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: Math.round(taille / 3) }}>
      <span
        style={{
          width: taille,
          height: taille,
          flex: 'none',
          borderRadius: Math.round(taille * 0.27),
          background: surEncre ? 'rgba(255, 255, 255, 0.12)' : 'var(--brand-ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MarqueMedere hauteur={Math.round(taille * 0.55)} />
      </span>
      <span
        className="marque-libelle"
        style={{
          fontSize: tailleLibelle,
          fontWeight: 600,
          letterSpacing: '0.01em',
          color: surEncre ? 'rgba(255, 255, 255, 0.72)' : 'var(--text-heading)',
        }}
      >
        {contexte}
      </span>
    </span>
  );
}

/**
 * Passage d'un monde à l'autre.
 *
 * **Ce n'est pas une entrée de navigation.** Les entrées désignent des sections
 * du même espace ; celle-ci change d'espace. Noémie écrit les explications qui
 * s'affichent après chaque réponse : sans voir le parcours en situation, elle
 * travaille à l'aveugle. Les outils qui séparent un mode auteur d'un mode
 * lecteur posent tous ce passage à côté de l'identité du site, jamais dans la
 * liste des sections — et c'est ce qu'on fait ici.
 *
 * **Aucun cas de maquette ne le couvre.** La forme est construite avec les
 * jetons existants et la géométrie des entrées de navigation, pour qu'elle
 * appartienne à la même famille : mêmes rembourrages, même rayon, même corps.
 * Ce qui la distingue est le fond, pas un filet ni une majuscule.
 */
function BasculeContexte({
  bascule,
  onNavigation,
}: {
  bascule: Bascule;
  onNavigation: () => void;
}) {
  return (
    <Link
      href={bascule.route}
      title={bascule.libelle}
      onClick={onNavigation}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        // Un pixel de moins en haut et en bas : la bordure le rend, et la
        // bascule garde exactement la hauteur d'une entrée de section.
        padding: '8px 9px',
        borderRadius: 'var(--radius-md)',
        // **Le fond plein est interdit ici.** C'est celui de l'entrée active :
        // le premier rendu donnait une bascule qui se lisait comme la section
        // en cours. Une bordure complète — jamais un filet d'un seul côté —
        // la sort de la liste sans la déguiser en section.
        background: 'transparent',
        border: '1px solid var(--border-default)',
        color: 'var(--text-heading)',
        fontSize: 'var(--body-sm-size)',
        fontWeight: 600,
        textDecoration: 'none',
        boxSizing: 'border-box',
      }}
    >
      <Icone nom={bascule.icone} taille={18} />
      <span className="coquille-libelle" style={{ flex: 1 }}>
        {bascule.libelle}
      </span>
    </Link>
  );
}

/** Les initiales, seules, quand la barre est repliée. */
function Initiales({ nom }: { nom: string }) {
  const avatar = useMonAvatar();
  return <Pastille nom={nom} avatar={avatar} taille={28} titre={nom} />;
}

/**
 * Le nombre au bout d'une entrée de navigation.
 *
 * **Tant qu'il n'est pas connu, rien ne s'affiche** — ni zéro, ni tiret, ni
 * squelette. Un compteur qui apparaît une demi-seconde après le reste est un
 * détail ; un compteur qui annonce « 0 » puis « 12 » est un mensonge court.
 *
 * Le nombre est annoncé en toutes lettres aux lecteurs d'écran : « 12 » collé
 * à « À revoir » ne se lit pas tout seul.
 */
function CompteurEntree({
  quoi,
  libelle,
}: {
  quoi: 'questionsServies' | 'ratees';
  libelle: string;
}) {
  const servies = useNombreDeQuestionsServies();
  const ratees = useNombreDeRatees();
  const nombre = quoi === 'questionsServies' ? servies : ratees;

  if (nombre === null) return null;

  return (
    <span
      className="coquille-libelle"
      style={{
        flex: 'none',
        fontSize: 11,
        fontWeight: 'var(--weight-bold)',
        color: 'var(--neutral-70)',
      }}
    >
      <span aria-hidden="true">{nombre}</span>
      <span className="visuellement-cache">
        {` - ${nombre} ${quoi === 'ratees' ? 'à revoir' : 'servies aux commerciaux'}, dans ${libelle}`}
      </span>
    </span>
  );
}

function PastilleUtilisateur({ nom, role }: { nom: string; role: string }) {
  const routeur = useRouter();
  const avatar = useMonAvatar();

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
      <Pastille nom={nom} avatar={avatar} taille={28} />
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

export function Coquille({
  nom,
  role,
  contexte,
  entrees,
  bascule,
  barreReduite = 'auto',
  children,
}: {
  nom: string;
  /** Affiché sous le nom, dans la pastille du bas. */
  role: string;
  /** Nom du monde où l'on se trouve, affiché à côté de la marque. */
  contexte: string;
  /** Sections de l'espace. Chacune mène à un écran qui existe. */
  entrees: Entree[];
  /** Passage vers l'autre espace. Omis pour qui n'a accès qu'à celui-ci. */
  bascule?: Bascule;
  /** État du repli au premier rendu, lu du témoin par le serveur. */
  barreReduite?: EtatBarre;
  children: ReactNode;
}) {
  const chemin = usePathname();
  const [etat, setEtat] = useState<EtatBarre>(barreReduite);
  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  const tiroir = useRef<HTMLElement | null>(null);

  // Le fond devient inerte tant que le tiroir est ouvert, le focus y entre,
  // et il revient au bouton qui l'a ouvert à la fermeture.
  usePanneauSuperpose(tiroirOuvert, tiroir);

  // Échap referme, comme tout ce qui se superpose à une page.
  useEffect(() => {
    if (!tiroirOuvert) return;
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') setTiroirOuvert(false);
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [tiroirOuvert]);

  /**
   * En automatique, le composant ignore si la barre paraît repliée ou non :
   * c'est une requête de média qui en décide. On bascule donc par rapport à
   * ce qui est réellement affiché, mesuré sur l'élément.
   */
  function basculerRepli() {
    const largeur = tiroir.current?.getBoundingClientRect().width ?? 0;
    const suivant: EtatBarre = largeur < 120 ? 'etendue' : 'reduite';
    setEtat(suivant);
    document.cookie = `${TEMOIN_BARRE}=${suivant}; path=/; max-age=31536000; samesite=lax`;
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
        <Marque contexte={contexte} />
      </header>

      {tiroirOuvert && (
        <button
          type="button"
          className="coquille-voile"
          data-superpose="voile"
          aria-label="Fermer la navigation"
          onClick={() => setTiroirOuvert(false)}
        />
      )}

      <nav
        ref={tiroir}
        className="coquille-nav"
        data-reduite={etat}
        data-ouvert={tiroirOuvert ? 'true' : 'false'}
        aria-label={`Sections de l'espace ${contexte}`}
      >
        <div
          className="coquille-marque"
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
            <Marque contexte={contexte} />
          </span>

          <button
            type="button"
            className="coquille-repli"
            onClick={basculerRepli}
            // Le libellé vaut dans les deux sens : en automatique, le
            // composant ne sait pas laquelle des deux formes est affichée.
            aria-label="Replier ou déplier la navigation"
            title="Replier ou déplier la navigation"
            style={boutonIcone}
          >
            {/* Un seul chevron dans le jeu d'icônes : on le retourne plutôt
                que d'en dessiner un second. La rotation est portée par la
                feuille de style, seule à connaître la forme affichée. */}
            <span className="coquille-chevron">
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
        {bascule && (
          <BasculeContexte bascule={bascule} onNavigation={() => setTiroirOuvert(false)} />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {entrees.map((entree) => {
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
                {/* Le compteur suit le libellé : replier la barre le masque
                    avec lui, sinon un nombre flotterait à côté d'une icône
                    sans dire de quoi il parle. */}
                {entree.compteur && (
                  <CompteurEntree quoi={entree.compteur} libelle={entree.libelle} />
                )}
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

            return (
              <Link
                key={entree.chemin}
                href={entree.route}
                // Toujours posé : au repli, c'est la seule façon de lire le
                // nom de la section à la souris.
                title={entree.libelle}
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
            <PastilleUtilisateur nom={nom} role={role} />
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
