'use client';

import { useEffect, useState } from 'react';

import { Carte, Meta } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import { Pastille } from '@/composants/session/Pastille';
import type { Distinction, Rang } from '@/lib/session/depot';

/**
 * Révélation du classement de fin de séance.
 *
 * **C'est le moment qui décide si les commerciaux reviennent jeudi prochain.**
 * L'ordre compte plus que le contenu : le rang personnel d'abord, seul à
 * l'écran ; le podium ensuite, qui se remplit par le bas ; le prix en dernier,
 * comme un objet qu'on gagne et non comme une ligne de résultat. Un tableau qui
 * s'ouvre sur le vainqueur dit aux huit autres qu'ils ont perdu.
 *
 * **`prefers-reduced-motion` est délibérément ignoré ici, et seulement ici.**
 * La mise en scène est la fonctionnalité : la désarmer rendrait l'écran correct
 * et sans intérêt. Rien n'y clignote, la séquence dure moins de cinq secondes,
 * et l'exception est documentée dans `CLAUDE.md` pour que personne ne la
 * « corrige » plus tard. Partout ailleurs dans l'outil, la préférence est
 * respectée sans discussion.
 */

const MEDAILLES: Record<Distinction, { libelle: string; teinte: string; encre: string }> = {
  diamant: { libelle: 'Diamant', teinte: '#17BEBB', encre: '#053b3a' },
  or: { libelle: 'Or', teinte: '#FECA45', encre: '#4a3a05' },
  argent: { libelle: 'Argent', teinte: '#DBD6CD', encre: '#3f3b3c' },
};

/** Les étapes s'enchaînent d'elles-mêmes ; l'attente fait partie du dessin. */
const ETAPES_MS = [1400, 700, 700, 700, 900];

function useSequence(nombreEtapes: number): number {
  const [etape, setEtape] = useState(0);

  useEffect(() => {
    if (etape >= nombreEtapes) return;
    const attente = ETAPES_MS[Math.min(etape, ETAPES_MS.length - 1)] ?? 700;
    const minuterie = window.setTimeout(() => setEtape((precedente) => precedente + 1), attente);
    return () => window.clearTimeout(minuterie);
  }, [etape, nombreEtapes]);

  return etape;
}

function Medaille({ distinction, taille = 64 }: { distinction: Distinction; taille?: number }) {
  const { teinte, encre } = MEDAILLES[distinction];
  return (
    <span
      aria-hidden="true"
      style={{
        width: taille,
        height: taille,
        flex: 'none',
        borderRadius: 999,
        background: teinte,
        color: encre,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'var(--shadow-raised)',
      }}
    >
      <Icone nom="award" taille={Math.round(taille * 0.5)} />
    </span>
  );
}

/** Le prix, comme un objet qu'on a gagné : une carte à soi, pas une mention. */
export function ObjetPrix({
  distinction,
  legende,
  taille = 64,
}: {
  distinction: Distinction;
  legende: string;
  taille?: number;
}) {
  const { libelle, teinte } = MEDAILLES[distinction];

  return (
    <Carte
      rayon="var(--radius-xl)"
      rembourrage="20px 22px"
      elevation="haute"
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}
    >
      <Medaille distinction={distinction} taille={taille} />
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(24px, 5vw, 30px)',
            lineHeight: 1.1,
            color: 'var(--text-heading)',
          }}
        >
          {libelle}
        </span>
        <span
          style={{
            display: 'block',
            marginTop: 4,
            fontSize: 'var(--body-sm-size)',
            color: 'var(--neutral-70)',
          }}
        >
          {legende}
        </span>
      </span>
      <span
        aria-hidden="true"
        style={{
          marginLeft: 'auto',
          width: 8,
          alignSelf: 'stretch',
          borderRadius: 999,
          background: teinte,
          flex: 'none',
        }}
      />
    </Carte>
  );
}

function LigneRang({ rang, moi, visible }: { rang: Rang; moi: boolean; visible: boolean }) {
  const medaille = rang.distinction ? MEDAILLES[rang.distinction] : null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        padding: '14px 18px',
        borderRadius: 'var(--radius-lg)',
        background: moi ? 'var(--surface-chip)' : 'var(--surface-card)',
        boxShadow: moi ? 'none' : 'var(--shadow-card-sm)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(14px)',
        transition: 'opacity 420ms var(--ease-out), transform 420ms var(--ease-out)',
      }}
    >
      {/*
        * La pastille d'abord, la médaille par-dessus.
        *
        * C'est la couleur qu'on reconnaît en premier sur un écran projeté ; la
        * médaille se lit ensuite. L'inverse — une médaille seule — dirait le
        * rang sans dire qui.
        */}
      <span style={{ position: 'relative', flex: 'none', lineHeight: 0 }}>
        <Pastille nom={rang.nom} avatar={rang.avatar} taille={38} />
        {rang.distinction && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: -5,
              bottom: -5,
              width: 22,
              height: 22,
              borderRadius: 999,
              background: MEDAILLES[rang.distinction].teinte,
              color: MEDAILLES[rang.distinction].encre,
              border: '2px solid var(--surface-card)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {/*
              * Le rang, pas le ruban.
              *
              * L'icône de médaille à onze pixels se lit comme une tache : trop
              * de détail pour la taille. Un chiffre se reconnaît, et il ne
              * risque pas de se confondre avec la teinte de la pastille quand
              * les deux tombent sur la même couleur.
              */}
            {rang.rang}
          </span>
        )}
      </span>

      {!rang.distinction && (
        <span
          aria-hidden="true"
          style={{
            flex: 'none',
            fontSize: 'var(--body-sm-size)',
            fontWeight: 700,
            color: 'var(--neutral-60)',
            minWidth: 18,
          }}
        >
          {rang.rang}
        </span>
      )}

      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--body-md-size)',
            fontWeight: moi ? 600 : 400,
            color: 'var(--text-heading)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {rang.nom}
          {moi ? ' · vous' : ''}
        </span>
        {medaille && <Meta style={{ fontSize: 12 }}>{medaille.libelle}</Meta>}
      </span>

      <span
        style={{
          flex: 'none',
          fontSize: 'var(--body-md-size)',
          fontWeight: 600,
          color: 'var(--text-heading)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {rang.justes}
      </span>
    </div>
  );
}

export function RevelationClassement({
  rangs,
  monUid,
  ecart,
  codeSession,
}: {
  rangs: Rang[];
  monUid: string;
  /** Bonnes réponses qui manquaient pour le podium, s'il y a lieu. */
  ecart: number | null;
  codeSession: string;
}) {
  const moi = rangs.find((rang) => rang.uid === monUid) ?? null;
  const podium = rangs.filter((rang) => rang.distinction !== null);

  // Rang personnel, puis le podium du bas vers le haut, puis le prix.
  const etape = useSequence(1 + podium.length + 1);

  const dateDuJour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(
    new Date(),
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        maxWidth: 620,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* 1 · Votre rang, seul à l'écran. Une seconde où il n'y a que vous. */}
      <div
        role="status"
        style={{
          textAlign: 'center',
          opacity: etape >= 0 ? 1 : 0,
          transform: etape >= 1 ? 'scale(1)' : 'scale(1.06)',
          transition: 'transform 600ms var(--ease-out)',
        }}
      >
        <Meta>Séance terminée</Meta>
        <p
          style={{
            margin: '10px 0 0',
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(34px, 9vw, 52px)',
            lineHeight: 1.05,
            color: 'var(--text-heading)',
          }}
        >
          {moi ? `Vous terminez ${moi.rang}${moi.rang === 1 ? 'er' : 'e'}` : 'Séance terminée'}
        </p>
        {moi && (
          <p style={{ margin: '8px 0 0', fontSize: 'var(--body-md-size)', color: 'var(--neutral-70)' }}>
            sur {rangs.length} participant{rangs.length > 1 ? 's' : ''} · {moi.justes} bonne
            {moi.justes > 1 ? 's' : ''} réponse{moi.justes > 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* 2 · Le podium se remplit par le bas. Le haut arrive en dernier. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {podium.map((rang, index) => (
          <LigneRang
            key={rang.uid}
            rang={rang}
            moi={rang.uid === monUid}
            // Le dernier du podium apparaît le premier : on remonte vers l'or.
            visible={etape >= 1 + (podium.length - 1 - index)}
          />
        ))}
      </div>

      {/* 3 · Le prix, comme un objet. Ou l'écart, nommé, pour la fois suivante. */}
      <div
        style={{
          opacity: etape >= 1 + podium.length ? 1 : 0,
          transform: etape >= 1 + podium.length ? 'translateY(0)' : 'translateY(18px)',
          transition: 'opacity 520ms var(--ease-out), transform 520ms var(--ease-out)',
        }}
      >
        {moi?.distinction ? (
          <ObjetPrix
            distinction={moi.distinction}
            legende={`Séance ${codeSession} du ${dateDuJour} · il rejoint votre accueil`}
          />
        ) : (
          <Carte rayon="var(--radius-lg)" rembourrage="18px 20px" elevation="petite">
            <span
              style={{
                display: 'block',
                fontSize: 'var(--body-md-size)',
                color: 'var(--text-heading)',
              }}
            >
              {ecart !== null
                ? `Il vous manquait ${ecart} bonne réponse${ecart > 1 ? 's' : ''} pour l’Argent.`
                : 'À égalité de points, c’est la vitesse qui a départagé.'}
            </span>
            <Meta style={{ fontSize: 13 }}>Votre rang reste dans votre historique.</Meta>
          </Carte>
        )}
      </div>

      {/* Le reste du classement, sans mise en scène : il est là pour être lu. */}
      {rangs.length > podium.length && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rangs
            .filter((rang) => rang.distinction === null)
            .map((rang) => (
              <LigneRang
                key={rang.uid}
                rang={rang}
                moi={rang.uid === monUid}
                visible={etape >= 1 + podium.length}
              />
            ))}
        </div>
      )}
    </div>
  );
}
