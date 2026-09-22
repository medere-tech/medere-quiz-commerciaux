import { vi } from 'vitest';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { Auth, User } from 'firebase/auth';
import type { ReadonlyURLSearchParams } from 'next/navigation';

/**
 * Les faux des surfaces qu'on ne possède pas.
 *
 * **Pourquoi ce fichier existe.** Depuis qu'on passe `vi.mock(import('…'))`, un
 * faux doit satisfaire le type du module qu'il remplace : TypeScript refuse
 * désormais un objet qui promet moins, ou autre chose, que le vrai. C'est ce
 * qu'on veut pour **nos** modules — un écart y est un défaut, et il est apparu
 * dès la première conversion.
 *
 * Deux surfaces tierces ne s'y plient pas raisonnablement : `Auth` de Firebase
 * porte une vingtaine de membres, et le routeur de Next en porte sept dont
 * nous n'appelons que trois. Les imiter en entier à chaque fichier de test
 * ferait plus de bruit que de garantie.
 *
 * **La règle qu'on se donne : les conversions de type vivent ici, nommées et
 * justifiées, et on les compte.** Il y en a deux. Pas une par fichier. Le jour où Firebase ajoute un membre que
 * notre code appelle, c'est ce fichier qu'on corrige, et tous les tests en
 * profitent. Une conversion dispersée, au contraire, se multiplie sans que
 * personne ne la recompte.
 */

/**
 * Le routeur de Next, **en entier et sans conversion**.
 *
 * Sept membres : c'est peu, et les implémenter tous vaut mieux qu'un `as`. Le
 * jour où Next en ajoute un, le compilateur le dira ici plutôt que de laisser
 * un test passer sur un routeur incomplet.
 */
export function fauxRouteur(gestes: Partial<AppRouterInstance> = {}): AppRouterInstance {
  return {
    back: () => {},
    forward: () => {},
    refresh: () => {},
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    bfcacheId: 'test',
    ...gestes,
  };
}

/**
 * `authentification()` de Firebase.
 *
 * **La seule conversion de type de la suite de tests, et elle est ici.** `Auth`
 * porte une vingtaine de membres — `app`, `name`, `config`, `setPersistence`,
 * `tenantId`, `languageCode`… — dont notre code n'appelle jamais que deux :
 * `currentUser` et `onAuthStateChanged`. Les écrire tous serait recopier le
 * SDK ; les taire sans conversion ne compile pas.
 *
 * Ce qu'on perd en la faisant : si un écran se mettait à appeler
 * `authentification().signOut()`, le test ne le verrait pas et planterait à
 * l'exécution. Ce qu'on gagne : un seul endroit à corriger, et un compte exact
 * de ce qu'on a laissé passer — un.
 */
export function fausseAuth(utilisateur: Partial<User> | null): Auth {
  return {
    currentUser: utilisateur as User | null,
    onAuthStateChanged: (suite: unknown) => {
      /* Le vrai crochet appelle tout de suite avec l'état connu, puis à chaque
         changement, et rend une fonction de désabonnement. Un faux qui
         n'appellerait jamais laisserait tous les écrans en chargement. */
      if (typeof suite === 'function') (suite as (u: unknown) => void)(utilisateur);
      else if (suite && typeof (suite as { next?: unknown }).next === 'function') {
        (suite as { next: (u: unknown) => void }).next(utilisateur);
      }
      return () => {};
    },
  } as unknown as Auth;
}

/**
 * Les crochets de préchargement, **de la forme exacte du vrai module**.
 *
 * `useIntentionDeNavigation` rend une fonction qui rend trois gestionnaires
 * d'événement ; les écrans étalent ce résultat sur un élément du DOM. Le faux
 * rendait `{}` : il aurait suffi qu'un écran l'appelle comme il est écrit pour
 * que le test tombe sur une erreur obscure au lieu d'une garantie.
 */
export function fausseIntention(): typeof import('@/lib/navigation/intention') {
  return {
    usePrechargementCertain: () => {},
    useIntentionDeNavigation: () => () => ({
      onMouseEnter: () => {},
      onTouchStart: () => {},
      onFocus: () => {},
    }),
  };
}

/**
 * Ce que rend `useSearchParams`.
 *
 * **Le vrai rend `ReadonlyURLSearchParams`, pas `URLSearchParams`** : la même
 * chose à l'exécution, mais dont les mutateurs sont interdits au type. Un
 * `URLSearchParams` nu ne s'y assigne donc pas — et c'est une bonne nouvelle,
 * puisque cela signale qu'un test qui écrirait dans la requête ne
 * reproduirait pas le vrai.
 *
 * Seconde et dernière conversion de la suite. Elle est sûre au sens où le
 * constructeur rend exactement l'objet que Next enveloppe.
 */
export function fausseRequete(chaine = ''): ReadonlyURLSearchParams {
  return new URLSearchParams(chaine) as unknown as ReadonlyURLSearchParams;
}

/** Un espion vide, pour un geste dont on ne vérifie que l'appel. */
export const geste = () => vi.fn();
