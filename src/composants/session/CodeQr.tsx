import qrcode from 'qrcode-generator';

import { lienRejoindre } from '@/lib/session/rejoindre';

/**
 * Le QR de la séance — la même information que le code, pour qui a le
 * téléphone en main.
 *
 * **Ce n'est pas un doublon décoratif.** Le code se dicte à voix haute, et
 * c'est précisément ce qui ne marche pas en visioconférence : la salle entend
 * avec du retard, parfois mal, et un `B` se confond avec un `P`. Le QR porte
 * l'adresse *et* le code : scanner supprime les deux occasions de se tromper.
 *
 * **L'adresse encodée contient le code**, et le code seul suffirait à un
 * humain — mais un appareil photo ne sait pas quoi faire d'un mot de six
 * lettres. L'adresse vient de `lienRejoindre`, la même source que celle
 * affichée sous le code : un QR qui pointerait ailleurs que l'adresse lue à
 * l'écran serait la pire des deux options.
 *
 * Rendu en SVG plutôt qu'en `<canvas>` ou en image : à 208 px sur un
 * vidéoprojecteur, les modules doivent rester des carrés nets, et le SVG ne
 * coûte aucune requête. La taille vient du CSS — `--sa-qr`, qui suit les
 * quatre densités de l'écran — et non d'un nombre passé en propriété : le
 * reste de la salle d'attente se règle déjà ainsi.
 */
export function CodeQr({ code }: { code: string }) {
  /*
   * Correction d'erreur « M » : 15 % du motif peut être masqué sans que le
   * décodage échoue. C'est le bon compromis pour un écran — un reflet, une tête
   * qui passe devant — là où « L » suffirait sur du papier.
   *
   * Version 0 : la bibliothèque choisit la plus petite qui contient la donnée.
   * Un numéro fixé casserait le jour où un code ferait un caractère de plus.
   */
  const motif = qrcode(0, 'M');
  /*
   * **L'adresse vient du module qui la détient, et lui la tient du
   * navigateur.**
   *
   * Le QR encodait `https://${URL_REJOINDRE}` — un domaine écrit à la main,
   * celui des adresses électroniques, qui ne sert nulle part à naviguer. Rien
   * ne garantissait qu'il réponde, et un QR qui mène ailleurs que la séance
   * fait rater l'entrée à toute la salle sans rien signaler.
   */
  motif.addData(lienRejoindre(code));
  motif.make();

  const modules = motif.getModuleCount();
  /* Zone franche de deux modules de chaque côté : sans elle, un lecteur ne
     trouve pas les repères d'angle. La norme en demande quatre ; deux
     suffisent sur un fond blanc plein, et la maquette dessine ce cadrage. */
  const marge = 2;
  const cote = modules + marge * 2;

  const carres: string[] = [];
  for (let ligne = 0; ligne < modules; ligne += 1) {
    for (let colonne = 0; colonne < modules; colonne += 1) {
      if (motif.isDark(ligne, colonne)) {
        carres.push(`M${colonne + marge} ${ligne + marge}h1v1h-1z`);
      }
    }
  }

  return (
    <svg
      role="img"
      aria-label={`QR code de la séance, code ${code}`}
      width="100%"
      height="100%"
      viewBox={`0 0 ${cote} ${cote}`}
      shapeRendering="crispEdges"
      style={{
        display: 'block',
        flex: 'none',
        borderRadius: 'var(--radius-md)',
        background: 'var(--neutral-0)',
      }}
    >
      <path d={carres.join('')} fill="var(--neutral-100)" />
    </svg>
  );
}
