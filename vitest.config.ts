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
      /*
       * `server-only` lève à l'import, sauf sous la condition `react-server`,
       * où il se résout vers `empty.js`. C'est ce que fait Next pour un module
       * serveur : on reproduit la résolution réelle, pas un faux. Les tests des
       * modules serveur peuvent ainsi les importer tels quels.
       */
      'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    /*
     * Les tests de bout en bout des Cloud Functions vivent à part : ils
     * exigent trois émulateurs et le module compilé de `functions/`, là où
     * ceux-ci n'exigent que Firestore. `npm run test:fonctions` les lance,
     * avec `vitest.fonctions.config.ts`.
     */
    exclude: ['tests/fonctions/**'],
    environment: 'node',
    // Les règles de sécurité s'exécutent dans un émulateur partagé : les
    // fichiers de test se succèdent, ils ne se marchent pas dessus.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
