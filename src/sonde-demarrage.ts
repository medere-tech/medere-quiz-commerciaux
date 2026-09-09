import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SONDE TEMPORAIRE — à retirer une fois le 500 de production expliqué.
 *
 * **Pourquoi un module à part.** `instrumentation.ts` est compilé pour les
 * deux runtimes, Node et Edge. Y écrire `process.cwd()` ou `process.features`
 * fait avertir le build à chaque passage. Le code Node vit donc ici, et n'est
 * chargé que par la branche Node de `register`.
 *
 * **Ce qu'elle cherche à distinguer.** Le 500 vient d'un `require()` de module
 * ES refusé au fond de `firebase-admin` → `jwks-rsa` → `jose`. Deux causes
 * possibles, et elles n'appellent pas la même correction :
 *
 * 1. Le processus n'a pas `require(esm)`. Alors `process.features.require_module`
 *    vaut `false`, et l'import direct échoue autant que le haché.
 * 2. La résolution du lien symbolique haché que Turbopack crée dans
 *    `.next/node_modules` place le paquet dans un contexte différent. Alors
 *    l'import direct passe et seul le haché échoue.
 *
 * La sonde n'échoue jamais : une `register` qui lève empêcherait le serveur de
 * démarrer, et on remplacerait un diagnostic par une panne.
 */

async function essayerImport(specificateur: string): Promise<string> {
  try {
    await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ specificateur);
    return 'OK';
  } catch (probleme) {
    const code = (probleme as { code?: unknown })?.code;
    const message = probleme instanceof Error ? probleme.message : String(probleme);
    return `ECHEC ${typeof code === 'string' ? code : ''} — ${message.slice(0, 220)}`;
  }
}

export async function sonder(): Promise<void> {
  console.log(
    '[SONDE] node=%s require_module=%s cwd=%s',
    process.version,
    process.features.require_module,
    process.cwd(),
  );

  // Le dossier que Turbopack crée depuis Next 16.2 pour les paquets
  // externalisés. S'il manque du déploiement, la résolution du nom haché ne
  // peut pas aboutir.
  const dossier = join(process.cwd(), '.next', 'node_modules');

  if (!existsSync(dossier)) {
    console.log('[SONDE] .next/node_modules : ABSENT');
  } else {
    const entrees = readdirSync(dossier);
    console.log('[SONDE] .next/node_modules :', entrees.join(', ') || '(vide)');

    for (const entree of entrees) {
      const chemin = join(dossier, entree);
      let nature = 'inconnue';
      try {
        nature = lstatSync(chemin).isSymbolicLink() ? 'lien' : 'dossier';
      } catch {
        /* la nature n'est qu'un indice, on continue */
      }
      let cible: string;
      try {
        cible = realpathSync(chemin);
      } catch (probleme) {
        cible = `(${(probleme as { code?: string })?.code ?? 'irrésolue'})`;
      }
      console.log('[SONDE]   %s : %s -> %s', entree, nature, cible);
    }

    // Le nom haché est découvert, jamais deviné : il dépend du contenu du
    // paquet, et une valeur codée en dur mentirait au prochain build.
    const hache = entrees.find((nom) => nom.startsWith('firebase-admin-'));
    console.log(
      '[SONDE] import haché  :',
      hache ? await essayerImport(`${hache}/auth`) : 'aucun paquet firebase-admin- trouvé',
    );
  }

  console.log('[SONDE] import direct :', await essayerImport('firebase-admin/auth'));
}
