/**
 * Tests de bout en bout des Cloud Functions.
 *
 * Compile `functions/`, démarre les trois émulateurs nécessaires — Firestore,
 * Auth et Functions —, puis fait tourner `tests/fonctions/`.
 *
 * **Pourquoi un script plutôt qu'une ligne dans `package.json`.** Deux raisons,
 * et la première est la plus coûteuse :
 *
 * 1. **Le délai de découverte.** Avant de servir les déclencheurs, la CLI
 *    Firebase charge le module compilé et lui demande la liste des fonctions.
 *    Passé **dix secondes** — la valeur par défaut —, elle abandonne avec
 *    « User code failed to load. Cannot determine backend specification. » Ce
 *    message a déjà désigné deux causes opposées sur ce projet : un vrai échec
 *    de chargement, et une simple lenteur. Mesuré ici, la découverte a expiré
 *    au réglage par défaut et passé à soixante. On le desserre donc, comme le
 *    fait déjà `fonctions:deploy`. Une variable d'environnement posée en tête
 *    de commande ne fonctionne pas sous PowerShell : d'où le script.
 *
 * 2. **La compilation préalable.** L'émulateur exécute `functions/lib`, pas
 *    `functions/src`. Sans build, il sert la version précédente — et l'on
 *    testerait autre chose que ce qu'on vient d'écrire. C'est très exactement
 *    le piège « ce que je viens de vérifier est-il bien ce qui sera exécuté ? »
 *    que ce projet a déjà payé deux fois.
 *
 * Usage :
 *   npm run test:fonctions
 */

import { spawn } from 'node:child_process';

/** Le défaut de la CLI est de dix secondes, et il a expiré ici. */
const DELAI_DECOUVERTE_SECONDES = 120;

const PROJET = 'demo-medere-quiz';

function executer(commande, arguments_, variables = {}) {
  return new Promise((ok, echec) => {
    const enfant = spawn(commande, arguments_, {
      stdio: 'inherit',
      // `shell` pour que la résolution de `npm` et `npx` fonctionne aussi sous
      // Windows, où l'exécutable est un `.cmd`.
      shell: true,
      env: { ...process.env, ...variables },
    });

    enfant.on('exit', (code) => (code === 0 ? ok() : echec(code ?? 1)));
  });
}

try {
  console.log('Compilation de functions/ — l’émulateur exécute lib/, pas src/.\n');
  await executer('npm', ['--prefix', 'functions', 'run', 'build']);

  console.log('\nDémarrage des émulateurs Firestore, Auth et Functions.\n');
  await executer(
    'npx',
    [
      'firebase',
      'emulators:exec',
      '--only',
      'firestore,auth,functions',
      '--project',
      PROJET,
      '"vitest run --config vitest.fonctions.config.ts"',
    ],
    { FUNCTIONS_DISCOVERY_TIMEOUT: String(DELAI_DECOUVERTE_SECONDES) },
  );
} catch (code) {
  process.exit(typeof code === 'number' ? code : 1);
}
