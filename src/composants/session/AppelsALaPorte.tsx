'use client';

import { useEffect, useState } from 'react';

import { Bouton, Meta } from '@/composants/ds/primitives';
import { Pastille } from '@/composants/session/Pastille';
import type { Appel } from '@/lib/session/depot';

/**
 * Qui est resté dehors — côté animatrice.
 *
 * **Le seul canal qui remonte de la salle.** Tout le reste descend : la
 * question, la révélation, le classement. Ici, quelqu'un qui n'est pas dans la
 * pièce demande à entrer, et Noémie doit pouvoir répondre sans quitter l'écran
 * qu'elle anime.
 *
 * **Deux réponses, et le verrou est global.** « Ouvrir l'accès » rouvre la
 * porte pour tout le monde — il n'existe pas d'admission nominative, et c'est
 * un choix : doubler le chemin d'entrée pour un cas rare coûterait plus qu'il
 * ne rapporte. Rouvrir, laisser entrer, refermer tient en trois gestes.
 * « Ignorer » efface l'appel sans rien ouvrir.
 *
 * **Un nom affiché est un nom vu.** Une séance hybride se partage par
 * visioconférence : ce que Noémie voit, la salle et les participants à
 * distance le voient aussi. Le bloc dit donc le strict nécessaire — un prénom,
 * une couleur, une attente — et **disparaît dès qu'elle agit**. Rien ne
 * s'accumule : un appel effacé ne laisse aucune trace de qui était en retard
 * ce jeudi-là.
 *
 * **Ajout hors maquette.** Claude Design ne couvre pas ce cas. Construit avec
 * `Bouton`, `Meta` et `Pastille` du système existant, sans composant, couleur
 * ni icône inventés — le jeu n'en porte aucune pour « prévenir ».
 */
export function AppelsALaPorte({
  appels,
  presentation,
  verrouillee,
  ouvertureEnCours = false,
  onOuvrir,
  onEcarter,
}: {
  appels: Appel[];
  /**
   * L'état de la porte.
   *
   * **« À la porte » n'a de sens que porte close.** Vu au navigateur : une
   * fois l'accès rouvert, le bloc continuait d'annoncer « 2 personnes
   * attendent » et offrait d'ouvrir une porte déjà ouverte — les appels ne
   * s'effacent qu'à l'entrée de chacun, ce qui prend quelques secondes. Le
   * bloc suit donc la porte, pas les documents. Si elle referme avant qu'ils
   * soient entrés, ils reparaissent : ils sont toujours dehors.
   */
  verrouillee: boolean;
  /**
   * `salle` — la salle d'attente, fond clair, pleine largeur du panneau.
   * `panneau` — le panneau de l'animatrice pendant la séance, plus compact.
   */
  presentation: 'salle' | 'panneau';
  ouvertureEnCours?: boolean;
  onOuvrir: () => void;
  onEcarter: (uid: string) => void;
}) {
  /*
   * L'horloge ne sert qu'à vieillir les attentes affichées. Elle ne tourne que
   * s'il y a quelqu'un à la porte : un battement par seconde sur un écran
   * projeté qui n'affiche rien serait du travail pour personne.
   */
  const [maintenant, setMaintenant] = useState(() => Date.now());

  useEffect(() => {
    if (appels.length === 0) return;
    const battement = setInterval(() => setMaintenant(Date.now()), 15_000);
    return () => clearInterval(battement);
  }, [appels.length]);

  // Personne dehors, ou porte ouverte : pas de bloc, pas de place réservée. Un
  // encadré vide permanent apprendrait à ne plus le regarder.
  if (appels.length === 0 || !verrouillee) return null;

  const enSalle = presentation === 'salle';

  return (
    <section
      aria-labelledby="appels-a-la-porte"
      /*
       * Bordure complète et fond teinté, jamais un filet d'un seul côté.
       * Teinte dérivée de `--status-warning` : le système ne publie de jetons
       * de bordure et de fond que pour le danger, et ceci n'en est pas un.
       */
      style={{
        marginTop: enSalle ? 'var(--space-5)' : 'var(--space-4)',
        padding: enSalle ? '14px 16px' : '12px 14px',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid rgba(254, 202, 69, 0.6)',
        background: 'rgba(254, 202, 69, 0.14)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3
          id="appels-a-la-porte"
          style={{
            margin: 0,
            fontSize: enSalle ? 'var(--sa-head)' : 'var(--body-sm-size)',
            fontWeight: 600,
            color: 'var(--text-heading)',
          }}
        >
          À la porte
        </h3>
        <Meta style={{ fontSize: enSalle ? 'var(--sa-meta-l)' : 12 }}>
          {appels.length > 1 ? `${appels.length} personnes attendent` : 'une personne attend'}
        </Meta>
      </span>

      <ul
        style={{
          listStyle: 'none',
          margin: '10px 0 0',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {appels.map((appel) => (
          <li
            key={appel.uid}
            style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}
          >
            <Pastille nom={appel.nom} avatar={appel.avatar} taille={enSalle ? 32 : 26} />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: enSalle ? 'var(--body-md-size)' : 'var(--body-sm-size)',
                fontWeight: 600,
                color: 'var(--text-heading)',
              }}
            >
              {appel.nom}
            </span>
            <Meta style={{ fontSize: 12, flex: 'none' }}>{attente(appel.demandeLeMs, maintenant)}</Meta>
            <Bouton
              taille="sm"
              variante="fantome"
              onClick={() => onEcarter(appel.uid)}
              style={{ flex: 'none' }}
            >
              Ignorer
            </Bouton>
          </li>
        ))}
      </ul>

      <span style={{ display: 'block', marginTop: 12 }}>
        <Bouton
          taille="sm"
          variante="secondaire"
          disabled={ouvertureEnCours}
          onClick={onOuvrir}
          pleineLargeur={enSalle}
        >
          {ouvertureEnCours ? 'Ouverture…' : 'Ouvrir l’accès'}
        </Bouton>
      </span>

      <Meta style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
        Ouvrir rouvre la porte pour tout le monde. Vous pourrez la refermer ensuite.
      </Meta>
    </section>
  );
}

/**
 * « à l'instant », « il y a 3 min ».
 *
 * La minute suffit : à la seconde près, le chiffre changerait sous les yeux de
 * la salle sans rien apprendre à personne.
 */
function attente(demandeLeMs: number | null, maintenant: number): string {
  if (demandeLeMs === null) return 'à l’instant';
  const minutes = Math.floor((maintenant - demandeLeMs) / 60_000);
  if (minutes < 1) return 'à l’instant';
  return `il y a ${minutes} min`;
}
