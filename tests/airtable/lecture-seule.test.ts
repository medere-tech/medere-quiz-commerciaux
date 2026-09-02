import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Airtable est en lecture seule, et cette règle doit survivre à la bonne
 * volonté de celui qui écrira le prochain lot. Ces tests lisent le code source
 * du module d'accès et échouent si une écriture y apparaît.
 *
 * Ce n'est pas une garantie absolue — on peut toujours contourner un test de
 * ce genre. C'est un garde-fou qui rend l'infraction visible en revue plutôt
 * que silencieuse, et qui oblige celui qui l'enlève à le faire exprès.
 */

const DOSSIER = join(process.cwd(), 'src', 'lib', 'airtable');

function fichiers(): { nom: string; contenu: string }[] {
  return readdirSync(DOSSIER)
    .filter((nom) => nom.endsWith('.ts'))
    .map((nom) => ({ nom, contenu: readFileSync(join(DOSSIER, nom), 'utf8') }));
}

describe("Airtable — lecture seule vérifiée sur le code d'accès", () => {
  it('aucune méthode HTTP autre que GET', () => {
    for (const { nom, contenu } of fichiers()) {
      const methodes = [...contenu.matchAll(/method:\s*'([A-Z]+)'/g)].map(
        (correspondance) => correspondance[1],
      );
      expect(methodes.every((methode) => methode === 'GET'), `${nom} : ${methodes.join(', ')}`).toBe(
        true,
      );
    }
  });

  it("aucun verbe d'écriture dans une requête", () => {
    const interdits = ["'POST'", "'PATCH'", "'PUT'", "'DELETE'"];
    for (const { nom, contenu } of fichiers()) {
      for (const interdit of interdits) {
        expect(contenu.includes(interdit), `${nom} contient ${interdit}`).toBe(false);
      }
    }
  });

  it('aucune fonction exportée dont le nom annonce une écriture', () => {
    const suspects = /export (async )?function (creer|ecrire|mettreAJour|supprimer|envoyer)/i;
    for (const { nom, contenu } of fichiers()) {
      expect(suspects.test(contenu), `${nom}`).toBe(false);
    }
  });

  it("le module d'accès existe bien à l'endroit vérifié", () => {
    const noms = fichiers().map((fichier) => fichier.nom);
    expect(noms).toContain('client.ts');
    expect(noms.length).toBeGreaterThanOrEqual(3);
  });
});
