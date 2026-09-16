'use client';

import { useEffect } from 'react';

import { signalerPanne } from '@/lib/journal/client';

import { EcranDePanne } from '@/composants/ds/ecrans-limites';

/**
 * Panne dans le back-office, la coquille restant à l'écran.
 *
 * Le texte diffère de celui du parcours, et pas par coquetterie : ce qu'on
 * craint ici n'est pas de perdre sa progression mais **une saisie en cours**.
 * Noémie écrit des questions longues. Lui dire ce qui est enregistré et ce qui
 * ne l'est pas est la seule information qui vaille à cet instant.
 */
export default function ErreurAdmin({
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
    // Côté serveur, `onRequestError` a déjà écrit la pile. Ici on signale ce
    // que le navigateur a vu : les deux journaux se rejoignent par le digest.
    signalerPanne('frontiere', erreur, erreur.digest);
  }, [erreur]);

  return (
    <EcranDePanne
      reessayer={reessayer}
      digest={erreur.digest}
      titre="L’écran n’a pas pu se charger"
      texte="La panne vient du serveur. Ce qui a déjà été enregistré est intact ; une saisie en cours au moment de la panne, en revanche, n’a pas été envoyée. Réessayez, ou passez à un autre écran par la navigation."
    />
  );
}
