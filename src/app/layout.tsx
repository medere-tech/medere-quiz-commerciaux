import '@/styles/systeme.css';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Entraînement commerciaux — Médéré',
  description: 'Entraînement au catalogue de formations Médéré.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RacineLayout({ children }: { children: ReactNode }) {
  /*
   * SONDE TEMPORAIRE — à retirer une fois la question tranchée.
   *
   * Le 500 de Vercel vient d'un `require()` de module ES refusé au fond de la
   * chaîne firebase-admin → jwks-rsa → jose. Node accepte ce `require` depuis
   * les versions 20.19, 22.12 et 23.0 ; la panne suppose donc que le processus
   * qui exécute l'application ne dispose pas de cette fonctionnalité, alors
   * qu'il tourne sur Node 22 ou 24. `process.features.require_module` le dit
   * sans ambiguïté — c'est la vérification que la documentation Node
   * elle-même recommande.
   */
  console.log(
    'SONDE require_module:',
    process.features.require_module,
    '| node:',
    process.version,
  );

  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
