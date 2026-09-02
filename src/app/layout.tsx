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
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
