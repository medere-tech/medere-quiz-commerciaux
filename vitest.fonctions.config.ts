import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Les tests de bout en bout des Cloud Functions, séparés du reste.
 *
 * **Pourquoi une configuration à part.** Ceux-ci exigent trois émulateurs
 * — Firestore, Auth et Functions — et le module compilé de `functions/`. Les
 * autres n'exigent que Firestore. Les mêler rendrait chaque exécution de
 * `npm test` dépendante d'une compilation et d'un démarrage à froid, pour un
 * jeu de tests qu'on veut pouvoir lancer vingt fois par heure.
 *
 * `npm run test:fonctions` lance celui-ci, `npm test` l'autre, et
 * `npm run test:tout` enchaîne les deux — c'est ce que fait l'intégration
 * continue.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      /*
       * Même raison qu'en configuration principale : `functions/` a son propre
       * `node_modules`, et deux copies de `firebase-admin` dont les sentinelles
       * ne se reconnaissent pas d'une copie à l'autre.
       */
      'firebase-admin/firestore': fileURLToPath(
        new URL('./node_modules/firebase-admin/lib/firestore/index.js', import.meta.url),
      ),
    },
  },
  test: {
    include: ['tests/fonctions/**/*.test.ts'],
    environment: 'node',
    // Un seul émulateur pour tous : les fichiers se succèdent.
    fileParallelism: false,
    /*
     * Généreux, et délibérément. Le premier déclenchement paie un démarrage à
     * froid mesuré à treize secondes, et chaque test attend un aller-retour
     * complet — écriture, déclenchement, écriture en retour. Un délai serré
     * produirait des échecs intermittents, qu'on finirait par relancer sans
     * les lire.
     */
    testTimeout: 90_000,
    hookTimeout: 180_000,
  },
});
