import { FirebaseError } from 'firebase/app';

/**
 * Traduction d'un échec de la fenêtre Google.
 *
 * Une fenêtre bloquée par le navigateur et une fenêtre refermée par
 * l'utilisateur produisent le même symptôme — pas de connexion — et appellent
 * deux gestes opposés : autoriser les fenêtres surgissantes dans un cas,
 * simplement recommencer dans l'autre. Les confondre envoie quelqu'un
 * recliquer indéfiniment sur un bouton que son navigateur intercepte.
 *
 * Le tri se fait sur le code d'erreur. Les libellés du SDK sont en anglais et
 * changent de version en version : ils ne sont pas un critère.
 */
export function messageDeFenetre(erreur: unknown): string {
  const code = erreur instanceof FirebaseError ? erreur.code : '';

  switch (code) {
    case 'auth/popup-blocked':
      return (
        "Votre navigateur a empêché la fenêtre Google de s'ouvrir. " +
        'Autorisez les fenêtres surgissantes pour ce site, puis réessayez.'
      );
    case 'auth/popup-closed-by-user':
    case 'auth/user-cancelled':
      return "La fenêtre Google s'est fermée avant la fin de la connexion. Réessayez.";
    case 'auth/cancelled-popup-request':
      return 'Une autre demande de connexion a pris la main. Réessayez.';
    case 'auth/network-request-failed':
      return "Google n'a pas répondu. Vérifiez votre connexion, puis réessayez.";
    case 'auth/unauthorized-domain':
      // Un réglage de projet, pas un geste d'utilisateur : réessayer ne peut
      // rien y changer, et le message ne le propose donc pas.
      return (
        "Ce domaine n'est pas autorisé pour la connexion Google. " +
        "C'est un réglage du projet Firebase : signalez-le à l'équipe technique."
      );
    default:
      return "La connexion Google n'a pas abouti. Réessayez dans un instant.";
  }
}
