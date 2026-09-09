import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      /*
       * `functions/` a son propre `node_modules`, exigé par le déploiement
       * Firebase. Sous test, les deux copies de `firebase-admin` coexistent et
       * leurs sentinelles — `FieldValue.increment` et consorts — ne se
       * reconnaissent pas d'une copie à l'autre : la comparaison est un
       * `instanceof`. On force donc la copie de la racine, les deux étant à la
       * même version.
       */
      'firebase-admin/firestore': fileURLToPath(
        new URL('./node_modules/firebase-admin/lib/firestore/index.js', import.meta.url),
      ),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Les règles de sécurité s'exécutent dans un émulateur partagé : les
    // fichiers de test se succèdent, ils ne se marchent pas dessus.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
