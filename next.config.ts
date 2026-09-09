import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    /*
     * Durée pendant laquelle le navigateur réutilise un écran déjà chargé.
     *
     * Depuis Next 15, `dynamic` vaut zéro par défaut : revenir sur l'accueil
     * après une série refaisait intégralement l'aller-retour serveur, mesuré à
     * 500 ms de médiane sur la production pour 1,4 ko de charge utile. Trente
     * secondes couvrent le va-et-vient réel d'une session d'entraînement —
     * accueil, série, accueil, à revoir — sans jamais garder assez longtemps
     * pour montrer un avancement périmé : les données de progression sont
     * relues côté navigateur par `useDonneesParcours`, pas figées dans ce
     * cache, qui ne porte que la coquille et la structure de la page.
     */
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default config;
