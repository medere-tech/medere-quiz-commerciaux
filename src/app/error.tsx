'use client';

import { useEffect } from 'react';

import { Cadre, EcranDePanne } from '@/composants/ds/ecrans-limites';

/**
 * Frontière d'erreur de la racine.
 *
 * **Ce qu'elle attrape, et ce qu'elle n'attrape pas.** Tout ce qui lève dans
 * une route sans frontière plus proche, y compris les **dispositions** de
 * `(parcours)`, `admin`, `serie` et `animer` — une frontière ne rattrape pas la
 * disposition de son propre segment. C'est précisément le cas qui compte :
 * `lireSession` lève une `ErreurVerificationIdentite` quand la vérification du
 * cookie échoue pour une raison qui n'est pas une session absente. Cette
 * distinction a coûté deux déploiements, et l'écran qu'elle produisait jusqu'ici
 * était celui de Next, qui ne dit rien.
 *
 * Elle ne rattrape pas la disposition racine : c'est le rôle de
 * `global-error.tsx`.
 */
export default function ErreurRacine({
  /*
   * **Les noms des propriétés sont imposés par Next**, d'où le renommage :
   * la frontière est appelée avec `error` et `retry`. Les traduire dans la
   * signature revenait à recevoir `undefined` des deux côtés.
   *
   * `retry` et non `reset` : `reset` se contente de vider l'état de la
   * frontière et de refaire le rendu, `retry` refait aussi la récupération
   * des données. C'est cette seconde qu'il faut ici — ce qui a échoué est une
   * lecture serveur, pas un rendu.
   */
  error: erreur,
  retry: reessayer,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Côté serveur, `onRequestError` a déjà écrit la pile. Ici, on écrit ce
    // que le navigateur a vu : les deux journaux se rejoignent par le digest.
    console.error('Panne rendue à l’écran', erreur);
  }, [erreur]);

  return (
    <Cadre>
      <EcranDePanne
        reessayer={reessayer}
        digest={erreur.digest}
        texte="La panne vient de notre serveur, pas de votre appareil. Rien de ce que vous avez déjà répondu n’est perdu : vos réponses sont enregistrées au fur et à mesure. Réessayez ; si l’écran ne revient pas, reconnectez-vous depuis l’accueil."
        retour={{ route: '/', libelle: 'Revenir à l’accueil' }}
      />
    </Cadre>
  );
}
