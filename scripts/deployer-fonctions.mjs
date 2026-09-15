/**
 * Déploiement des Cloud Functions, avec un délai de découverte desserré.
 *
 * **Le problème qu'il résout.** Avant de déployer, la CLI Firebase démarre un
 * runtime local, charge le module compilé et lui demande la liste des
 * déclencheurs sur `/__/functions.yaml`. Si la réponse n'arrive pas dans les
 * **dix secondes** — la valeur par défaut —, elle abandonne avec :
 *
 *     Error: User code failed to load. Cannot determine backend specification.
 *     Timeout after 10000.
 *
 * **Ce message ne dit pas ce qu'il a l'air de dire.** Lu dans
 * `firebase-tools/lib/deploy/functions/runtimes/discovery/index.js`, « User
 * code failed to load » est un préfixe fixe, présent aussi bien quand le
 * module échoue que quand il répond trop tard. Les deux cas se distinguent à un
 * détail : **quand le module échoue vraiment, la CLI ajoute la sortie d'erreur
 * du runtime** ; quand elle expire, il n'y a que la ligne « Timeout after ».
 *
 * Mesuré sur ce dépôt, machine au repos : le module charge en 386 à 776 ms, la
 * découverte complète répond en 877 à 1863 ms. Le plafond de dix secondes est
 * donc à cinq ou onze fois la valeur normale — confortable, sauf quand la
 * machine est chargée ou que le lien se fige, ce qui est arrivé.
 *
 * Deux minutes ne masquent rien : une vraie panne de chargement produit une
 * sortie d'erreur, pas une attente.
 *
 * Usage :
 *   npm run fonctions:deploy
 *   npm run fonctions:deploy -- --project medere-quiz-commerciaux
 */

import { spawn } from 'node:child_process';

/** Deux minutes. Le défaut de la CLI est de dix secondes. */
const DELAI_DECOUVERTE_SECONDES = 120;

const arguments_ = process.argv.slice(2);

const enfant = spawn(
  'npx',
  ['firebase', 'deploy', '--only', 'functions', ...arguments_],
  {
    stdio: 'inherit',
    // `shell` pour que la résolution de `npx` fonctionne aussi sous Windows,
    // où l'exécutable est un `.cmd`.
    shell: true,
    env: { ...process.env, FUNCTIONS_DISCOVERY_TIMEOUT: String(DELAI_DECOUVERTE_SECONDES) },
  },
);

enfant.on('exit', (code) => process.exit(code ?? 1));
