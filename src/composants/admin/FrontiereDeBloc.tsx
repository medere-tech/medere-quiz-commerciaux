'use client';

import { Component, type ReactNode } from 'react';

/**
 * Frontière d'erreur à l'échelle d'un bloc.
 *
 * Les écrans d'administration reçoivent certaines lectures serveur en
 * promesse, lue par `use()` sous `Suspense` : la page s'affiche sans les
 * attendre. Si la promesse est rejetée, `use()` lève — sans frontière, c'est
 * l'écran entier qui tomberait pour un seul bloc.
 *
 * Elle n'avale rien : React journalise l'erreur attrapée (`onCaughtError`), le
 * serveur a journalisé le rejet, et le bloc affiche son propre état d'échec
 * au lieu de se taire.
 */
export class FrontiereDeBloc extends Component<
  { repli: ReactNode; children: ReactNode },
  { echec: boolean }
> {
  state = { echec: false };

  static getDerivedStateFromError() {
    return { echec: true };
  }

  render() {
    return this.state.echec ? this.props.repli : this.props.children;
  }
}
