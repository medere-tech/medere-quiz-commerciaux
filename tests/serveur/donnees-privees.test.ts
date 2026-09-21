import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * L'invariant qui rend la lecture serveur acceptable.
 *
 * **Ce module contourne les règles Firestore**, et c'est assumé : la décision
 * du 21 septembre 2026 est écrite au README, avec ses deux chiffres. Ce qui la
 * rend tenable n'est pas une promesse de relecture, c'est ce fichier.
 *
 * Trois choses sont gardées ici, et elles se lisent dans le texte du module —
 * pas dans son comportement, parce qu'un test de comportement ne verrait que
 * les chemins qu'on aurait pensé à lui montrer :
 *
 * 1. **Aucune fonction exportée ne prend d'argument.** Pas d'uid, pas
 *    d'identifiant, rien. On ne peut donc pas *nommer* quelqu'un d'autre.
 * 2. **Aucun chemin ne sort de `users/{uid}`**, et l'uid vient de la session.
 * 3. **`server-only`** est importé : le module ne peut pas partir au
 *    navigateur.
 *
 * Si ces tests deviennent gênants, c'est le signe qu'on est en train de rouvrir
 * la question — et elle se retranche, elle ne se contourne pas.
 */

const SOURCE = readFileSync('src/lib/serveur/donnees-privees.ts', 'utf8');

/** Le corps du fichier, commentaires retirés : on teste le code, pas la prose. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('Le module ne peut pas atteindre le navigateur', () => {
  it('importe server-only', () => {
    expect(CODE).toMatch(/^import 'server-only';/m);
  });
});

describe('Aucun export ne prend d’identifiant', () => {
  /*
   * **Le test qui porte toute la garantie.** Une fonction qui accepterait un
   * uid pourrait lire les scores de n'importe qui : l'appelant choisirait la
   * cible. Sans paramètre, la cible est toujours la session.
   */
  it('n’accepte aucun paramètre, sur aucune fonction exportée', () => {
    const signatures = [...CODE.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g)];

    expect(signatures.length).toBeGreaterThan(0);
    for (const [, nom, parametres] of signatures) {
      expect(`${nom}(${(parametres ?? '').trim()})`).toBe(`${nom}()`);
    }
  });

  it('n’exporte ni constante ni classe qui pourrait en porter une', () => {
    expect(CODE).not.toMatch(/export\s+(const|let|var|class)\s/);
  });
});

describe('Aucun chemin ne sort du sous-arbre de la session', () => {
  /*
   * L'uid n'est lu qu'à un seul endroit, et il vient de `exigerSession()`.
   * Une seconde source — un argument, un en-tête, un paramètre d'adresse —
   * serait exactement la faille que le sans-paramètre interdit.
   */
  it('ne tire l’identifiant que de la session', () => {
    expect(CODE).toMatch(/exigerSession\(\)/);
    const sourcesUid = [...CODE.matchAll(/\buid\b\s*[:=]/g)];
    /* Une seule affectation : celle qui vient de la session. */
    expect(sourcesUid.length).toBeLessThanOrEqual(2);
  });

  it('ne nomme aucune collection racine hors « users »', () => {
    const collections = [...CODE.matchAll(/\.collection\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(collections.length).toBeGreaterThan(0);
    for (const nom of collections) {
      expect(['users', 'etats']).toContain(nom);
    }
  });

  /* `users` n'est atteint qu'une fois, et immédiatement réduit à un document
     par l'uid de la session : jamais une requête sur la collection entière. */
  it('réduit « users » à un document, sans jamais l’interroger en entier', () => {
    expect(CODE).toMatch(/collection\('users'\)\.doc\(session\.uid\)/);
    expect(CODE).not.toMatch(/collection\('users'\)\s*\.\s*(get|where|orderBy|limit)/);
  });
});
