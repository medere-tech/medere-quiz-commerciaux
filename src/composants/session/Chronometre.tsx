'use client';

import { useEffect, useState } from 'react';

import { Icone } from '@/composants/ds/Icone';

/**
 * Compte à rebours de la question en cours.
 *
 * **Une échéance, pas une durée.** Le décompte part de l'instant où
 * l'animatrice a poussé la question, pas de l'instant où cet appareil l'a
 * reçue. Un participant en visioconférence voit l'écran partagé avec plusieurs
 * secondes de retard ; un retardataire arrive au milieu. Tous doivent voir la
 * même échéance, sinon le chronomètre récompense le réseau au lieu de la
 * connaissance.
 *
 * **Il cadence, il ne ferme pas.** L'horloge d'un navigateur peut dériver de
 * quelques secondes, et rien de sérieux ne se fonde là-dessus : ce qui ferme le
 * vote est la révélation par l'animatrice, vérifiée côté serveur. Zéro, ici,
 * veut dire « le temps conseillé est écoulé », pas « c'est fini ».
 */
export function Chronometre({
  ouverteLeMs,
  dureeSecondes,
  clair = false,
}: {
  ouverteLeMs: number | null;
  dureeSecondes: number;
  /** Sur le fond sombre de l'écran projeté. */
  clair?: boolean;
}) {
  const [maintenant, setMaintenant] = useState(() => Date.now());

  useEffect(() => {
    if (dureeSecondes <= 0 || ouverteLeMs === null) return;
    const battement = window.setInterval(() => setMaintenant(Date.now()), 250);
    return () => window.clearInterval(battement);
  }, [dureeSecondes, ouverteLeMs]);

  if (dureeSecondes <= 0 || ouverteLeMs === null) return null;

  const restant = Math.max(0, Math.ceil((ouverteLeMs + dureeSecondes * 1000 - maintenant) / 1000));
  const presse = restant <= 10 && restant > 0;
  const ecoule = restant === 0;

  const teinte = clair
    ? ecoule
      ? 'rgba(255,255,255,0.55)'
      : '#fff'
    : ecoule
      ? 'var(--neutral-50)'
      : presse
        ? 'var(--status-danger-texte)'
        : 'var(--text-heading)';

  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
      // Le décompte n'est pas annoncé seconde par seconde : un lecteur d'écran
      // qui lirait « 12, 11, 10 » couvrirait la question elle-même.
      aria-hidden="true"
    >
      <Icone nom="clock" taille={clair ? 18 : 16} />
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontVariantNumeric: 'tabular-nums',
          fontSize: clair ? 'var(--body-lg-size)' : 'var(--body-sm-size)',
          fontWeight: 600,
          color: teinte,
        }}
      >
        {ecoule ? 'temps écoulé' : `${restant} s`}
      </span>
    </span>
  );
}
