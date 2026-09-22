// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fausseRequete, fauxRouteur } from '../aide/faux';

/**
 * L'état des listes, porté par l'adresse.
 *
 * **Ce test existe parce que le navigateur a trouvé ce que les tests d'écran ne
 * pouvaient pas voir.** Ils faisaient dire à `useSearchParams` ce qui les
 * arrangeait ; le vrai `useSearchParams`, lui, **ne provoque aucun rendu** après
 * un `history.replaceState` — malgré ce qu'annonce la documentation de Next.
 * Mesuré en 16.3.4 : l'adresse passait bien à `?format=vf`, l'onglet actif
 * restait « Tous les formats », et la liste ne se filtrait plus.
 *
 * Le faux ci-dessous reproduit donc le comportement réel : **une adresse figée**.
 * Un `definir` qui ne changerait rien sous ce faux est un filtre cassé en
 * production.
 */

/* L'adresse que le routeur rend, et qui ne bougera pas — comme en vrai. */
let adresseDuRouteur = fausseRequete();
const remplacer = vi.fn();
const naviguer = vi.fn();

vi.mock(import('next/navigation'), () => ({
  useRouter: () => fauxRouteur({ push: naviguer, replace: naviguer }),
  usePathname: () => '/a-revoir',
  useSearchParams: () => adresseDuRouteur,
}));

const { useParametresUrl } = await import('@/lib/navigation/parametres-url');

const DEFAUTS = { format: 'tous', tri: 'echecs', vus: '20' };

function Ecran() {
  const { valeurs, definir, chaine } = useParametresUrl(DEFAUTS);
  return (
    <div>
      <span data-testid="valeurs">{`${valeurs.format}|${valeurs.tri}|${valeurs.vus}`}</span>
      <span data-testid="chaine">{chaine}</span>
      <button type="button" onClick={() => definir({ format: 'vf' })}>
        filtrer
      </button>
      <button type="button" onClick={() => definir({ tri: 'anciennete' })}>
        trier
      </button>
      <button type="button" onClick={() => definir({ format: 'tous' })}>
        tout
      </button>
    </div>
  );
}

const valeurs = () => screen.getByTestId('valeurs').textContent;

beforeEach(() => {
  adresseDuRouteur = fausseRequete();
  remplacer.mockReset();
  naviguer.mockReset();
  window.history.replaceState = remplacer as unknown as typeof window.history.replaceState;
  render(<Ecran />);
});

afterEach(cleanup);

describe('Ce que l’écran affiche après un choix', () => {
  it('part des défauts', () => {
    expect(valeurs()).toBe('tous|echecs|20');
  });

  /* **Le test qui porte le défaut trouvé au navigateur.** */
  it('redessine sans attendre que le routeur bouge', () => {
    act(() => screen.getByText('filtrer').click());
    expect(valeurs()).toBe('vf|echecs|20');
  });

  /*
   * Et deux choix successifs se cumulent : si le second repartait de l'adresse
   * du routeur — restée vide —, il effacerait le premier. C'est exactement ce
   * qu'on a observé : `?tri=anciennete` remplaçait `?format=qcm`.
   */
  it('cumule deux choix successifs', () => {
    act(() => screen.getByText('filtrer').click());
    act(() => screen.getByText('trier').click());
    expect(valeurs()).toBe('vf|anciennete|20');
    expect(screen.getByTestId('chaine').textContent).toBe('format=vf&tri=anciennete');
  });

  it('retire de l’adresse une valeur revenue à son défaut', () => {
    act(() => screen.getByText('filtrer').click());
    act(() => screen.getByText('tout').click());
    expect(valeurs()).toBe('tous|echecs|20');
    expect(screen.getByTestId('chaine').textContent).toBe('');
  });
});

describe('Ce qui part au réseau', () => {
  /*
   * **Filtrer n'est pas naviguer.** Une navigation redemanderait au serveur la
   * charge du segment — mesuré : quatre requêtes pour un onglet, dix pour trois
   * frappes de recherche. Voir `CLAUDE.md`.
   */
  it('ne navigue jamais', () => {
    act(() => screen.getByText('filtrer').click());
    act(() => screen.getByText('trier').click());
    expect(naviguer).not.toHaveBeenCalled();
  });

  /* L'adresse est tout de même écrite : un rechargement retombe sur la même
     vue, et une recherche se partage par un lien. */
  it('écrit l’adresse par l’historique', () => {
    act(() => screen.getByText('filtrer').click());
    expect(remplacer).toHaveBeenCalledWith(null, '', '/a-revoir?format=vf');
  });

  it('écrit un chemin nu quand tout est au défaut', () => {
    act(() => screen.getByText('tout').click());
    expect(remplacer).toHaveBeenCalledWith(null, '', '/a-revoir');
  });
});

describe('Ce qui reprend la main sur un choix', () => {
  /* Les flèches du navigateur : c'est l'adresse qui décide. */
  it('le retour arrière', () => {
    act(() => screen.getByText('filtrer').click());
    expect(valeurs()).toBe('vf|echecs|20');

    window.history.pushState({}, '', '/a-revoir?tri=formation');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(valeurs()).toBe('tous|formation|20');
  });
});
