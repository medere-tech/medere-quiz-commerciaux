import localFont from 'next/font/local';

/**
 * Chargement des deux familles du système de design.
 *
 * **Pourquoi `next/font/local` plutôt que six `@font-face` dans la feuille de
 * style.** Les fichiers étaient dans `public/polices/`, référencés par une URL
 * fixe depuis `systeme.css`. Quatre défauts venaient avec, mesurés en
 * production :
 *
 * 1. `public/` est servi par Vercel avec `Cache-Control: public, max-age=0,
 *    must-revalidate`, là où `/_next/static` reçoit `immutable` pour un an.
 *    Les polices étaient donc revalidées à chaque navigation — quatre
 *    allers-retours de plus, à chaque visite. `next/font` émet les fichiers
 *    sous `/_next/static/media/` avec un nom haché : le nom change quand le
 *    fichier change, donc le cache peut être définitif.
 * 2. Aucun préchargement. Les polices étaient découvertes par la feuille de
 *    style, soit une chaîne HTML → CSS → police. `next/font` injecte le
 *    `<link rel="preload">` dans le `<head>`, ce qui supprime un maillon.
 * 3. `font-display` était bien posé à `swap`, mais à la main, sur six
 *    déclarations qu'il fallait penser à garder synchronisées.
 * 4. Rien n'alignait la police de repli sur la police finale : le texte
 *    changeait de largeur au moment du swap. `adjustFontFallback` calcule les
 *    métriques de repli à partir du fichier lui-même.
 *
 * **Les six faces sont préchargées.** Un préchargement inutile coûte de la
 * bande passante — web.dev met en garde contre le réflexe. Ici les six sont
 * employées dans les premières secondes d'une session : les quatre graisses
 * d'Aileron portent l'interface, DM Serif Text porte les titres, en romain
 * comme en italique. L'écran de connexion n'en utilise que quatre et paie donc
 * 34 ko qu'il n'affiche pas ; à partir du deuxième écran, tout est déjà en
 * cache pour un an. Si ces 34 ko devaient être repris, il faudrait scinder
 * les appels par face, ce qui coûterait la cohérence de la police de repli.
 *
 * Les fichiers `.woff2` sont produits par `scripts/convertir-polices.py` à
 * partir de `polices-source/`. Ne pas les modifier à la main.
 */

export const aileron = localFont({
  src: [
    { path: '../polices/Aileron-Light.woff2', weight: '300', style: 'normal' },
    { path: '../polices/Aileron-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../polices/Aileron-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: '../polices/Aileron-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--police-sans',
  display: 'swap',
  preload: true,
  // Aileron est une linéale : Arial est le repli dont les métriques s'en
  // approchent le plus parmi les deux valeurs acceptées.
  adjustFontFallback: 'Arial',
  fallback: ['-apple-system', 'Segoe UI', 'sans-serif'],
});

export const dmSerifText = localFont({
  src: [
    { path: '../polices/DMSerifText-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../polices/DMSerifText-Italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--police-display',
  display: 'swap',
  preload: true,
  adjustFontFallback: 'Times New Roman',
  fallback: ['Georgia', 'serif'],
});
