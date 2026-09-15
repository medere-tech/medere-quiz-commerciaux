'use client';

/**
 * La dernière frontière : une panne dans la disposition racine elle-même.
 *
 * **Elle remplace `<html>` et `<body>`**, donc elle ne peut compter sur rien —
 * ni sur les polices chargées par la disposition, ni sur `systeme.css`, ni sur
 * les variables de couleur. Tout est donc écrit ici, en dur et en peu de
 * lignes. Un écran qu'on ne verra sans doute jamais n'est pas un écran qu'on
 * peut se permettre de rendre dépendant de ce qui vient de casser.
 *
 * Les valeurs reprennent celles du système — encre, blanc cassé, rouge
 * d'alerte — pour que, si elle s'affiche, elle reste de la même maison.
 */
export default function ErreurGlobale({
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
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#faf7f2',
          color: '#302d2d',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        }}
      >
        <main style={{ maxWidth: 520 }}>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.2, fontWeight: 600 }}>
            L’application n’a pas pu démarrer
          </h1>
          <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.55, color: '#5c5757' }}>
            La panne vient de notre serveur. Aucune de vos réponses n’est perdue. Réessayez dans un
            instant ; si l’écran ne revient pas, prévenez l’équipe.
          </p>
          <button
            type="button"
            onClick={reessayer}
            style={{
              marginTop: 20,
              padding: '12px 22px',
              fontSize: 15,
              fontWeight: 600,
              color: '#fff',
              background: '#302d2d',
              border: '1px solid transparent',
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
          {erreur.digest && (
            <p style={{ marginTop: 20, fontSize: 13, color: '#5c5757' }}>
              Référence à signaler : <span style={{ userSelect: 'all', fontWeight: 600 }}>{erreur.digest}</span>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
