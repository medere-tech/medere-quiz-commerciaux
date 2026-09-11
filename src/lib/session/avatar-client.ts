'use client';

import { useEffect, useState } from 'react';

import { authentification } from '@/lib/firebase/client';
import { AVATAR_PAR_DEFAUT, avatarOuDefaut, type CleAvatar } from '@/lib/session/avatar';

/**
 * Ma propre teinte, pour l'afficher dans la coquille.
 *
 * **Pourquoi une lecture côté navigateur plutôt que sur le serveur.** La
 * disposition connaît déjà le nom et le rôle : ils viennent du cookie de
 * session, sans aucune lecture. Y ajouter l'avatar obligerait à lire
 * `users/{uid}` à chaque rendu de page, donc à payer un aller-retour Firestore
 * sur le TTFB de tous les écrans authentifiés — pour une pastille.
 *
 * **Pourquoi Firestore est chargé dynamiquement.** Ce module est appelé par la
 * coquille, qui est atteignable depuis l'écran de connexion : un `import`
 * ordinaire y ramènerait tout le SDK Firestore — **159 ko mesurés**, exactement
 * ceux que le lot de performance avait sortis du fragment d'entrée. La règle est
 * écrite dans `CLAUDE.md` : Firestore n'est importé que par les modules qui
 * s'en servent. L'import à la demande la respecte, puisqu'il ne s'exécute qu'une
 * fois la coquille montée, c'est-à-dire sur un écran authentifié.
 *
 * **Un écouteur plutôt qu'une lecture unique** : changer de couleur au moment de
 * rejoindre une séance met la pastille à jour sans recharger la page. Il vit une
 * fois par chargement complet — la coquille survit aux navigations internes.
 */
export function useMonAvatar(): CleAvatar {
  const [avatar, setAvatar] = useState<CleAvatar>(AVATAR_PAR_DEFAUT);

  useEffect(() => {
    const utilisateur = authentification().currentUser;
    if (!utilisateur) return;

    let vivant = true;
    let arreter: (() => void) | null = null;

    void (async () => {
      const [{ doc, onSnapshot }, { baseDeDonnees }] = await Promise.all([
        import('firebase/firestore'),
        import('@/lib/firebase/firestore'),
      ]);

      // Le composant a pu être démonté pendant le chargement du SDK.
      if (!vivant) return;

      arreter = onSnapshot(
        doc(baseDeDonnees(), 'users', utilisateur.uid),
        (instantane) => setAvatar(avatarOuDefaut(instantane.data()?.avatar)),
        // Une pastille qu'on ne peut pas lire garde sa teinte par défaut : ce
        // n'est pas un écran à faire tomber pour ça.
        () => setAvatar(AVATAR_PAR_DEFAUT),
      );
    })();

    return () => {
      vivant = false;
      arreter?.();
    };
  }, []);

  return avatar;
}
