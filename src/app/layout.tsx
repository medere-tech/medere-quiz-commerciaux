import '@/styles/systeme.css';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { aileron, dmSerifText } from '@/styles/polices';

export const metadata: Metadata = {
  title: 'Entraînement commerciaux — Médéré',
  description: 'Entraînement au catalogue de formations Médéré.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/**
 * Les deux classes de police sont posées sur `<html>` : elles n'apportent que
 * les variables CSS `--police-sans` et `--police-display`, que `systeme.css`
 * consomme. C'est aussi ce qui décide de la portée du préchargement — appelé
 * depuis le layout racine, il vaut pour toutes les routes.
 */
export default function RacineLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${aileron.variable} ${dmSerifText.variable}`}>
      <body>
        {/*
         * Ouvrir à l'avance les connexions vers reCAPTCHA.
         *
         * App Check démarre après l'hydratation, et paie à ce moment-là le DNS,
         * le TCP et le TLS vers Google — mesuré entre 207 et 675 ms selon les
         * tours, au moment précis où l'on attend le jeton pour lire Firestore.
         * `preconnect` déplace ce coût pendant l'arrivée du HTML.
         *
         * Rien n'est envoyé, rien n'est téléchargé, l'attestation est
         * identique : on ouvre la porte plus tôt, c'est tout. React remonte ces
         * balises dans le `<head>`.
         */}
        <link rel="preconnect" href="https://www.google.com" />
        <link rel="preconnect" href="https://www.gstatic.com" />
        {children}
      </body>
    </html>
  );
}
