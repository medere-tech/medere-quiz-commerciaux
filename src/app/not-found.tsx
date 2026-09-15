import { EcranIntrouvable } from '@/composants/ds/ecrans-limites';

/**
 * Page introuvable. Elle sert aussi de 404 au back-office : Noémie garde des
 * onglets ouverts sur des questions, et une question supprimée laisse un lien
 * mort.
 */
export default function PageIntrouvable() {
  return <EcranIntrouvable />;
}
