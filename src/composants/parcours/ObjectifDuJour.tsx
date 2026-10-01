'use client';

import { Carte, Meta } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import { Picto } from '@/composants/ds/Picto';
import {
  clefDuJour,
  semaineAffichee,
  serieAffichee,
  type Assiduite,
} from '@/lib/serie/assiduite';
import { TAILLE_SERIE } from '@/lib/serie/tirage';

/**
 * L'objectif du jour et la régularité.
 *
 * **C'est la seule mécanique d'assiduité de l'outil**, et c'est elle qui décide
 * si l'on revient le lendemain. Elle dit trois choses et pas une de plus : ce
 * qu'il y a à faire aujourd'hui, ce qu'on a fait cette semaine, depuis combien
 * de jours on tient.
 *
 * **Rien n'est stocké par jour.** La semaine et la série sont dérivées d'un
 * champ de taille constante — voir `src/lib/serie/assiduite.ts`. La série
 * affichée n'est pas celle de la base : une série se rompt par le temps qui
 * passe, et aucune écriture n'a lieu le jour où l'on ne joue pas.
 *
 * **Les lettres ne suffisent pas.** « M » désigne le mardi et le mercredi, et
 * un lecteur d'écran n'a pas la colonne pour les distinguer. Chaque pastille
 * porte donc son jour et son état en toutes lettres.
 */

const NOMS_JOURS = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
] as const;

export function ObjectifDuJour({
  assiduite,
  disponibles,
}: {
  assiduite: Assiduite;
  /** Questions servies : l'objectif ne peut pas promettre plus que la banque. */
  disponibles: number;
}) {
  const aujourdhui = clefDuJour(new Date());
  const jours = semaineAffichee(assiduite, aujourdhui);
  const serie = serieAffichee(assiduite, aujourdhui);
  const faitAujourdhui = assiduite.dernierJour === aujourdhui;
  /* « À reprendre » suppose une série qui a existé. Sans aucun jour joué —
     le premier jour de tout le monde —, il n'y a rien à reprendre, seulement
     à commencer. */
  const dejaJoue = assiduite.record > 0;
  const objectif = faitAujourdhui
    ? 'C’est fait pour aujourd’hui'
    : disponibles === 0
      ? 'En attente des premières questions'
      : `Une série de ${Math.min(TAILLE_SERIE, disponibles)}, avant midi`;

  return (
    <Carte rayon="var(--radius-xl)" rembourrage="0" elevation="petite" style={{ overflow: 'hidden' }}>
      <div className="objectif-jour">
        <span className="objectif-intitule">
          <Meta>Objectif du jour</Meta>
          <span
            style={{
              display: 'block',
              marginTop: 4,
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              lineHeight: 1.2,
              color: 'var(--text-heading)',
              textWrap: 'pretty',
            }}
          >
            {objectif}
          </span>
        </span>

        <ul className="objectif-semaine">
          {jours.map((jour, rang) => (
            <li
              key={jour.clef}
              className="objectif-pastille"
              data-etat={jour.fait ? 'fait' : jour.ouvre ? 'ouvre' : 'repos'}
            >
              <span aria-hidden="true" className="objectif-lettre">
                {jour.lettre}
              </span>
              {jour.fait ? (
                <Icone nom="check" taille={12} epaisseur={2.4} couleur="var(--neutral-100)" />
              ) : (
                <span aria-hidden="true" className="objectif-point" />
              )}
              <span className="visuellement-cache">
                {/* Le fond ne distingue pas un vendredi à venir d'un lundi
                    manqué — la maquette n'en fait pas deux états. Le texte, lui,
                    le dit : c'est une information, et elle ne coûte rien. */}
                {`${NOMS_JOURS[rang]} : ${
                  jour.fait
                    ? 'série faite'
                    : jour.aVenir
                      ? 'à venir'
                      : jour.ouvre
                        ? 'aucune série'
                        : 'repos'
                }`}
              </span>
            </li>
          ))}
        </ul>

        <span className="objectif-serie">
          <Picto nom="regularite" taille={30} />
          <span>
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-display)',
                fontSize: 26,
                lineHeight: 1,
                color: 'var(--text-heading)',
              }}
            >
              {serie > 0 ? `${serie} jour${serie > 1 ? 's' : ''}` : dejaJoue ? 'À reprendre' : 'À commencer'}
            </span>
            <Meta style={{ fontSize: 12 }}>
              {serie === 0
                ? assiduite.record > 0
                  ? `record ${assiduite.record} jour${assiduite.record > 1 ? 's' : ''}`
                  : 'une série par jour ouvré suffit'
                : `d’affilée · record ${assiduite.record}`}
            </Meta>
          </span>
        </span>
      </div>
    </Carte>
  );
}
