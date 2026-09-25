// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fausseApplication, fausseAuth, fauxRouteur } from '../aide/faux';
import { AVATAR_PAR_DEFAUT } from '@/lib/session/avatar';

/**
 * La position dans l'outil, dite au lecteur d'écran.
 *
 * Le fond coloré de l'entrée active ne dit rien à qui n'y voit pas : sans
 * `aria-current`, rien dans tout l'outil n'indique où l'on se trouve. La
 * coquille est commune au parcours et au back-office — un test la couvre pour
 * les deux.
 */

let adresse = '/';

vi.mock(import('next/navigation'), () => ({
  useRouter: () => fauxRouteur(),
  usePathname: () => adresse,
}));

vi.mock(import('@/lib/firebase/client'), () => ({
  authentification: () => fausseAuth({ uid: 'moi', displayName: 'Camille Martin' }),
  applicationFirebase: () => fausseApplication(),
}));

/* La déconnexion ne part qu'au clic, qu'aucun de ces tests ne fait. */
vi.mock(import('@/lib/auth/connexion-client'), () => ({
  seDeconnecter: async () => {},
}));

/* Sans utilisateur connecté, le vrai crochet rend l'avatar par défaut et ne lit rien. */
vi.mock(import('@/lib/session/avatar-client'), () => ({
  useMonAvatar: () => AVATAR_PAR_DEFAUT,
}));

const { Coquille } = await import('@/composants/ds/Coquille');

const PARCOURS = [
  { libelle: 'Accueil', icone: 'home', chemin: '/', route: '/' },
  { libelle: 'Récompenses', icone: 'award', chemin: '/recompenses', route: '/recompenses' },
] as const;

/* Les entrées du back-office, sans leurs compteurs : ils lisent Firestore, et la règle n'en dépend pas. */
const ADMIN = [
  { libelle: 'Banque', icone: 'table', chemin: '/admin/questions', route: '/admin/questions' },
  { libelle: 'Import', icone: 'upload', chemin: '/admin/import', route: '/admin/import' },
] as const;

function rendre(chemin: string, entrees: Parameters<typeof Coquille>[0]['entrees']) {
  adresse = chemin;
  render(
    <Coquille nom="Camille Martin" role="Commerciale" contexte="Entraînement" entrees={entrees}>
      <p>contenu</p>
    </Coquille>,
  );
}

const lien = (nom: string) => screen.getByRole('link', { name: new RegExp(`^${nom}`) });

afterEach(cleanup);

describe('La position dans la barre latérale', () => {
  it('marque la page courante du parcours, et elle seule', () => {
    rendre('/recompenses', [...PARCOURS]);
    expect(lien('Récompenses').getAttribute('aria-current')).toBe('page');
    expect(lien('Accueil').hasAttribute('aria-current')).toBe(false);
  });

  /* `/` est le préfixe de toutes les adresses : l'accueil ne doit pas se croire partout. */
  it('ne déclare l’accueil courant que sur l’accueil', () => {
    rendre('/', [...PARCOURS]);
    expect(lien('Accueil').getAttribute('aria-current')).toBe('page');
    expect(lien('Récompenses').hasAttribute('aria-current')).toBe(false);
  });

  it('dit « dans cette section » sur un écran que l’entrée contient', () => {
    rendre('/admin/questions/q-12', [...ADMIN]);
    expect(lien('Banque').getAttribute('aria-current')).toBe('true');

    const autres = screen
      .getAllByRole('link')
      .filter((element) => element.hasAttribute('aria-current'));
    expect(autres).toHaveLength(1);
  });
});
