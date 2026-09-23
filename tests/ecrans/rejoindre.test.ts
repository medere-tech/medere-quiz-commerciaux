// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';

import {
  adresseRejoindre,
  CHEMIN_REJOINDRE,
  DOMAINE_PUBLIC,
  lienRejoindre,
} from '@/lib/session/rejoindre';

/**
 * 18 · L'adresse de la séance — celle qu'on lit, celle que le QR encode.
 *
 * **Ce que ces tests gardent, et pourquoi il en fallait.** L'adresse a été une
 * constante écrite à la main, `medere.fr/rejoindre`, un domaine qui ne sert
 * nulle part à naviguer. Rien ne le signalait : le texte s'affichait, le QR
 * s'imprimait, la suite était verte, et c'est la salle qui découvrait le jeudi
 * que le lien ne menait nulle part.
 *
 * Elle vient désormais de l'origine du navigateur. Ces tests fixent la règle —
 * **l'adresse affichée et celle du QR sortent de la même origine, celle de la
 * page** — plutôt qu'une valeur, qu'il faudrait réécrire à chaque domaine.
 */

const ORIGINE_ORIGINALE = window.location.href;

/**
 * Déplace la page à une autre origine.
 *
 * happy-dom laisse écrire `location.href`, ce que jsdom refuse : c'est la
 * raison pour laquelle ce fichier déclare cet environnement-là. Aucune
 * conversion de type ici — l'écriture est celle qu'un navigateur accepte.
 */
function poserLOrigine(href: string): void {
  window.location.href = href;
}

afterEach(() => poserLOrigine(ORIGINE_ORIGINALE));

describe('l’adresse lue sur l’écran projeté', () => {
  /*
   * **Les origines de ces tests ne sont pas celle de production, et c'est
   * délibéré.** Une assertion écrite sur le domaine de production passerait
   * aussi avec l'ancienne implémentation — la constante écrite à la main vaut
   * désormais la même chaîne. Elle ne garderait donc rien. Vérifié en
   * remettant l'ancienne version : seuls les tests posés sur une *autre*
   * origine tombent.
   */
  it('est celle du site qui projette l’écran, sans protocole', () => {
    poserLOrigine('https://quiz.exemple.test/admin/session/s1');

    // Sans « https:// » : on ne dicte pas un protocole, et il ne se recopie pas.
    expect(adresseRejoindre()).toBe(`quiz.exemple.test${CHEMIN_REJOINDRE}`);
  });

  it('suit une prévisualisation sans qu’on y pense', () => {
    poserLOrigine('https://medere-quiz-abc123.vercel.app/admin/session/s1');

    expect(adresseRejoindre()).toBe(`medere-quiz-abc123.vercel.app${CHEMIN_REJOINDRE}`);
  });

  it('garde le port, quand il y en a un', () => {
    poserLOrigine('http://localhost:3000/admin/session/s1');

    expect(adresseRejoindre()).toBe(`localhost:3000${CHEMIN_REJOINDRE}`);
  });
});

describe('le lien encodé par le QR', () => {
  it('mène à la séance concernée, sur l’origine de la page, code compris', () => {
    poserLOrigine('https://medere-quiz-commerciaux.vercel.app/admin/session/s1');

    expect(lienRejoindre('JEUDI7')).toBe(
      'https://medere-quiz-commerciaux.vercel.app/rejoindre?code=JEUDI7',
    );
  });

  /*
   * **Le QR et le texte ne peuvent pas diverger.** C'est tout l'intérêt de les
   * faire sortir d'ici : un QR qui pointerait ailleurs que l'adresse lue à
   * l'écran serait pire que pas de QR du tout, et personne ne le verrait avant
   * la séance.
   */
  it('porte la même origine que l’adresse affichée', () => {
    // Une autre origine que la production : sinon la constante suffirait.
    poserLOrigine('https://quiz.exemple.test/admin/session/s1');

    expect(lienRejoindre('JEUDI7')).toBe('https://quiz.exemple.test/rejoindre?code=JEUDI7');
    expect(lienRejoindre('JEUDI7').startsWith(`https://${adresseRejoindre()}?`)).toBe(true);
  });

  it('échappe ce qui doit l’être', () => {
    poserLOrigine('https://exemple.test/');

    expect(lienRejoindre('A B&C')).toBe('https://exemple.test/rejoindre?code=A%20B%26C');
  });
});

describe('le repli du rendu serveur', () => {
  /*
   * Il ne s'affiche jamais : la salle d'attente n'apparaît qu'une fois la
   * séance lue par l'écouteur, donc côté client. Il doit tout de même porter
   * le vrai domaine — une constante fausse finit par être lue par quelqu'un.
   */
  it('porte le domaine de production, pas celui des adresses électroniques', () => {
    expect(DOMAINE_PUBLIC).toBe('medere-quiz-commerciaux.vercel.app');
  });
});
