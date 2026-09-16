'use client';

import { useEffect } from 'react';

import { signalerPanne } from '@/lib/journal/client';

import { EcranDePanne } from '@/composants/ds/ecrans-limites';

/**
 * Panne dans l'espace commercial, la coquille restant à l'écran.
 *
 * **Pourquoi une frontière par section, alors que la racine en a une.** Celle
 * de la racine remplace tout, coquille comprise : on se retrouve sur un écran
 * nu, sans navigation, et la seule issue est le bouton qu'on y a mis. Ici, la
 * disposition tient toujours — la barre latérale, le nom, la bascule : la panne
 * est cantonnée à la page, et l'on passe à un autre écran comme si de rien
 * n'était. C'est la différence entre « l'accueil ne se charge pas » et
 * « l'application est tombée ».
 */
export default function ErreurParcours({
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
      texte="La panne vient de notre serveur, pas de votre appareil. Vos réponses déjà envoyées sont enregistrées. Réessayez, ou passez à un autre écran par la navigation."
    />
  );
}
