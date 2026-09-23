import { redirect } from 'next/navigation';

/**
 * L'adresse dictée à la salle.
 *
 * **C'est la porte d'entrée de la séance collective, et elle ne mène nulle part
 * de nouveau** : elle renvoie sur `/session`, l'écran d'accès qui existe déjà.
 * Son intérêt n'est pas technique, il est oral — l'animatrice la dicte à voix
 * haute devant une salle, et « rejoindre » se recopie sans hésiter là où
 * « session » se confond avec « cession ».
 *
 * **Une redirection, pas un second écran.** Deux routes qui rendent le même
 * formulaire, ce sont deux écrans à tenir, et un jour deux écrans qui
 * divergent. Le coût est un aller-retour serveur supplémentaire, payé une fois,
 * sur une adresse tapée à la main — c'est le seul endroit de l'application où
 * ce coût ne se voit pas.
 *
 * Le chemin vit dans `src/lib/session/rejoindre.ts`, avec le texte que l'écran
 * projeté affiche : une seule source, pour qu'un mur ne puisse pas dicter une
 * adresse morte.
 */
export default async function PageRejoindre({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  /*
   * **Le code traverse la redirection.** Il ne le faisait pas : le QR de la
   * salle d'attente encodait `/rejoindre?code=XXXXXX`, et cette page renvoyait
   * sur `/session` tout court. Scanner menait donc au formulaire vide, sur
   * lequel il fallait ressaisir à la main le code qu'on venait de scanner —
   * exactement ce que le QR existe pour éviter.
   */
  const { code } = await searchParams;
  const propre = (Array.isArray(code) ? code[0] : code)?.trim().toUpperCase();

  redirect(propre ? `/session?code=${encodeURIComponent(propre)}` : '/session');
}
