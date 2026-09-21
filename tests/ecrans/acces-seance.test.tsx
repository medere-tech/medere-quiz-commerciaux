// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rendre, session } from './aide';
import type { Participant, Session } from '@/lib/session/depot';
import { fausseAuth } from '../aide/faux';

/**
 * 10a, 10b, 06, 06b · L'accès à la séance — ce que l'écran montre.
 *
 * **Trois choses à garantir, et une seule est évidente.**
 *
 * La première est évidente : le formulaire rejoint, et un code refusé le dit.
 *
 * La deuxième l'est moins : **l'écran ne doit jamais annoncer un chiffre qu'il
 * n'a pas**. Une séance sans chronomètre n'a pas de durée — annoncer « environ
 * 0 minute » serait faux, et c'est précisément le genre de faute qu'aucune
 * relecture ne rattrape parce qu'elle a l'air d'un nombre.
 *
 * La troisième est la plus facile à casser sans le voir : **un code refusé et
 * une panne de réseau ne se disent pas de la même façon.** Confondre les deux
 * ferait chercher une faute de frappe à quelqu'un qui a simplement perdu le
 * réseau.
 *
 * Interrogation par rôle et par texte visible, jamais par classe.
 */

/* ------------------------------------------------ le monde autour de l'écran */

let ecouteurPresents: ((presents: Participant[] | null) => void) | null = null;

type VerdictAcces = import('@/composants/session/AccesSeance').VerdictAcces;

const seanceOuverte = vi.fn<() => Promise<Session | null>>();
const onRejoindre =
  vi.fn<
    (code: string, nom: string, avatar: string, presence: string) => Promise<VerdictAcces>
  >();

vi.mock(import('@/lib/session/depot'), async (original) => {
  const vrai = await original<typeof import('@/lib/session/depot')>();
  return {
    ...vrai,
    seanceOuverte: () => seanceOuverte(),
    ecouterPresents: (_id: string, rappel: (presents: Participant[] | null) => void) => {
      ecouteurPresents = rappel;
      return () => {
        ecouteurPresents = null;
      };
    },
  };
});

/**
 * Le client Firebase, réduit à rien.
 *
 * `depot` l'atteint par `firestore.ts`, et le vrai module démarre App Check —
 * qui n'a rien à faire dans un test d'écran, et qui ne démarrerait pas faute de
 * navigateur attesté. Sans ce faux, le module refuse de se charger sur
 * l'absence des variables publiques.
 */
vi.mock(import('@/lib/firebase/client'), () => ({
  authentification: () => fausseAuth(null),
}));

const { AccesSeance } = await import('@/composants/session/AccesSeance');

function presents(): Participant[] {
  return [
    { uid: 'u1', nom: 'Yanis Belkacem', avatar: 'bleu', presence: 'salle' },
    { uid: 'u2', nom: 'Léa Fournier', avatar: 'jaune', presence: 'visio' },
  ];
}

beforeEach(() => {
  ecouteurPresents = null;
  seanceOuverte.mockReset().mockResolvedValue(session());
  onRejoindre.mockReset().mockResolvedValue('entre');
});

afterEach(cleanup);

function monter() {
  return rendre(<AccesSeance uid="uid-jordan" nomPropose="Jordan" onRejoindre={onRejoindre} />);
}

/**
 * La carte « Au programme », celle du bureau.
 *
 * **Pourquoi il faut la désigner.** L'écran porte deux dessins dans le même
 * DOM — la colonne du bureau et la bande compacte du mobile — que `display`
 * fait se relayer. Sans feuille de style, le test voit les deux, et le titre de
 * la séance y figure deux fois. Une requête globale sur ce titre serait donc
 * ambiguë : on interroge la région nommée.
 */
function programme() {
  return within(screen.getByRole('region', { name: 'Au programme' }));
}

/**
 * Attend que la séance ouverte soit lue, annoncée, et la salle abonnée.
 *
 * **Les deux attentes sont nécessaires.** La région paraît dès que la séance
 * est connue ; l'abonnement à la salle, lui, part dans l'effet qui suit ce
 * rendu-là. Pousser des présents avant que l'écouteur soit posé ne faisait
 * rien du tout — et le test échouait une fois sur dix, ce qui est la pire
 * façon d'échouer.
 */
async function seanceAnnoncee() {
  await screen.findByRole('region', { name: 'Au programme' });
  await waitFor(() => expect(ecouteurPresents).not.toBeNull());
}

/* ------------------------------------------------------------ ce qui s'annonce */

describe('Ce que la séance annonce', () => {
  it('affiche le titre de la séance ouverte', async () => {
    monter();
    await seanceAnnoncee();
    expect(programme().getByText('Objections sur les classes virtuelles')).toBeTruthy();
  });

  it('annonce la séance ouverte et son animatrice', async () => {
    monter();
    await screen.findByText('Séance ouverte');
    expect(screen.getByText(/animée par Noémie/)).toBeTruthy();
  });

  /*
   * Deux questions à 45 s font 180 s avec la révélation, soit 3 minutes, qui
   * remontent au plancher de 5. Le chiffre affiché doit être celui-là, jamais
   * une durée stockée.
   */
  it('annonce une durée calculée, pas une durée saisie', async () => {
    monter();
    await seanceAnnoncee();
    expect(programme().getByText('minutes environ')).toBeTruthy();
  });

  /*
   * **Le cas qui compte.** Un chronomètre à zéro veut dire « au rythme de la
   * parole » : aucune durée n'est calculable, et l'écran ne doit pas en
   * inventer une.
   */
  it('n’annonce aucune durée quand rien ne cadence la séance', async () => {
    seanceOuverte.mockResolvedValue(session({ dureeQuestionSecondes: 0 }));
    monter();
    await seanceAnnoncee();
    expect(programme().queryByText('minutes environ')).toBeNull();
    // Et le nombre de questions, lui, reste annoncé.
    expect(programme().getByText('questions')).toBeTruthy();
  });

  it('retombe sur la date de création quand le titre est vide', async () => {
    seanceOuverte.mockResolvedValue(
      session({ titre: '', creeeLeMs: Date.parse('2026-09-17T09:00:00Z') }),
    );
    monter();
    await seanceAnnoncee();
    expect(programme().getByText('Séance du jeudi 17 septembre')).toBeTruthy();
  });

  it('dit qu’aucune séance n’est ouverte plutôt que d’afficher un programme vide', async () => {
    seanceOuverte.mockResolvedValue(null);
    monter();
    expect(await screen.findByText(/Aucune séance n’est ouverte/)).toBeTruthy();
    // Le formulaire reste utilisable : une séance en pause se rejoint au code.
    expect(screen.getByLabelText('Code de la séance')).toBeTruthy();
  });
});

/* --------------------------------------------------------- déjà dans la salle */

describe('Déjà dans la salle', () => {
  it('nomme les présents reçus par l’écouteur', async () => {
    monter();
    await seanceAnnoncee();

    ecouteurPresents?.(presents());

    expect(await screen.findByText('Yanis Belkacem')).toBeTruthy();
    expect(screen.getByText('Léa Fournier')).toBeTruthy();
  });

  it('annonce une salle vide sans faire croire à une panne', async () => {
    monter();
    await seanceAnnoncee();

    ecouteurPresents?.([]);

    expect(await screen.findByText(/Personne encore/)).toBeTruthy();
  });

  /*
   * La lecture est refusée dès que la séance se termine — c'est la règle qui
   * fonctionne, pas un incident. L'écran se vide, il ne s'alarme pas.
   */
  it('traite un refus de lecture comme une salle vide, pas comme une erreur', async () => {
    monter();
    await seanceAnnoncee();

    ecouteurPresents?.(presents());
    await screen.findByText('Yanis Belkacem');

    ecouteurPresents?.(null);

    await waitFor(() => expect(screen.queryByText('Yanis Belkacem')).toBeNull());
    expect(screen.getByText(/Personne encore/)).toBeTruthy();
  });
});

/* -------------------------------------------------------------- le formulaire */

describe('Rejoindre', () => {
  async function remplir(code: string) {
    monter();
    await seanceAnnoncee();
    fireEvent.change(screen.getByLabelText('Code de la séance'), { target: { value: code } });
  }

  it('met le code en capitales et retire les espaces', async () => {
    await remplir('jeudi 7');
    expect((screen.getByLabelText('Code de la séance') as HTMLInputElement).value).toBe('JEUDI7');
  });

  it('transmet le code, le nom et la couleur', async () => {
    await remplir('jeudi7');
    fireEvent.click(screen.getByRole('button', { name: /Rejoindre/ }));

    await waitFor(() => expect(onRejoindre).toHaveBeenCalledOnce());
    expect(onRejoindre.mock.calls[0]?.[0]).toBe('JEUDI7');
    expect(onRejoindre.mock.calls[0]?.[1]).toBe('Jordan');
  });

  it('propose le prénom du compte sans écraser une saisie', async () => {
    await remplir('jeudi7');
    const champNom = screen.getByLabelText(/Votre nom au classement/) as HTMLInputElement;
    expect(champNom.value).toBe('Jordan');

    fireEvent.change(champNom, { target: { value: 'Jo' } });
    expect((screen.getByLabelText(/Votre nom au classement/) as HTMLInputElement).value).toBe('Jo');
  });

  /* 10b et 06b : le code refusé. */
  it('dit qu’aucune séance ne porte ce code', async () => {
    onRejoindre.mockResolvedValue('introuvable');
    await remplir('jeudi9');
    fireEvent.click(screen.getByRole('button', { name: /Rejoindre/ }));

    expect(await screen.findByText('Aucune séance ouverte avec ce code.')).toBeTruthy();
  });

  it('efface le refus dès qu’on corrige le code', async () => {
    onRejoindre.mockResolvedValue('introuvable');
    await remplir('jeudi9');
    fireEvent.click(screen.getByRole('button', { name: /Rejoindre/ }));
    await screen.findByText('Aucune séance ouverte avec ce code.');

    fireEvent.change(screen.getByLabelText('Code de la séance'), { target: { value: 'JEUDI7' } });

    await waitFor(() =>
      expect(screen.queryByText('Aucune séance ouverte avec ce code.')).toBeNull(),
    );
  });

  /*
   * **Une salle fermée n'est pas un code faux**, et c'est toute la question
   * de cet écran : les deux refus demandent deux gestes opposés. Le champ ne
   * doit surtout pas se marquer — rouge, il enverrait relire un code juste.
   */
  it('distingue une salle fermée d’un code refusé', async () => {
    onRejoindre.mockResolvedValue('fermee');
    await remplir('jeudi7');
    fireEvent.click(screen.getByRole('button', { name: /Rejoindre/ }));

    expect(await screen.findByText(/L’accès à cette séance est fermé/)).toBeTruthy();
    expect(screen.queryByText('Aucune séance ouverte avec ce code.')).toBeNull();
  });

  it('dit que le code est bon et qui peut rouvrir', async () => {
    onRejoindre.mockResolvedValue('fermee');
    await remplir('jeudi7');
    fireEvent.click(screen.getByRole('button', { name: /Rejoindre/ }));

    const avis = await screen.findByRole('status');
    expect(avis.textContent).toMatch(/code est bon/);
    expect(avis.textContent).toMatch(/animatrice/);
    expect(avis.textContent).toMatch(/rouvrir/);
  });

  /*
   * **La porte fermée s'annonce avant la première frappe.** Remplir le
   * formulaire entier pour s'entendre répondre « fermé » serait un piège poli :
   * l'étiquette de tête le dit d'emblée.
   */
  it('annonce la porte fermée avant toute tentative', async () => {
    seanceOuverte.mockResolvedValue(session({ verrouillee: true }));
    monter();

    expect(await screen.findByText('Accès fermé')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/L’animatrice a fermé l’accès/);
  });

  /*
   * **Le cas trouvé au navigateur, et il vaut le détour.** `sessionId` ne vit
   * que dans l'état React : qui est *dans la salle* et recharge son onglet
   * repasse par cet écran. Lui annoncer « accès fermé » pendant que son nom
   * figure dans la liste des présents juste à côté serait absurde — et les
   * règles le laissent rentrer, son marqueur existe.
   */
  it('ne dit pas « fermé » à quelqu’un qui est déjà dans la salle', async () => {
    seanceOuverte.mockResolvedValue(session({ verrouillee: true }));
    monter();
    await seanceAnnoncee();

    ecouteurPresents?.([
      { uid: 'uid-jordan', nom: 'Jordan', avatar: 'vert', presence: 'salle' },
    ]);

    await screen.findByText('Séance ouverte');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('efface l’avis dès qu’on saisit un autre code', async () => {
    onRejoindre.mockResolvedValue('fermee');
    await remplir('jeudi7');
    fireEvent.click(screen.getByRole('button', { name: /Rejoindre/ }));
    await screen.findByRole('status');

    fireEvent.change(screen.getByLabelText('Code de la séance'), { target: { value: 'JEUDI8' } });

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  /*
   * **Une panne n'est pas un code refusé.** C'est la distinction qui évite de
   * faire chercher une faute de frappe à quelqu'un qui a perdu le réseau.
   */
  it('distingue une panne de recherche d’un code refusé', async () => {
    onRejoindre.mockRejectedValue(new Error('réseau'));
    await remplir('jeudi7');
    fireEvent.click(screen.getByRole('button', { name: /Rejoindre/ }));

    expect(await screen.findByText(/La recherche n’a pas abouti/)).toBeTruthy();
    expect(screen.queryByText('Aucune séance ouverte avec ce code.')).toBeNull();
  });

  it('n’envoie rien tant que le code est vide', async () => {
    monter();
    await seanceAnnoncee();

    const bouton = screen.getByRole('button', { name: /Rejoindre/ }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
  });

  it('la touche Entrée vaut Rejoindre', async () => {
    await remplir('jeudi7');
    fireEvent.keyDown(screen.getByLabelText('Code de la séance'), { key: 'Enter' });

    await waitFor(() => expect(onRejoindre).toHaveBeenCalledOnce());
  });
});

/* ------------------------------------------------------------ choix de couleur */

describe('Le choix de couleur', () => {
  it('offre les huit teintes, une seule cochée', async () => {
    monter();
    await seanceAnnoncee();

    // L'écran porte deux groupes de radios — la couleur et le lieu : on
    // interroge celui qu'on teste, pas tous les boutons de la page.
    const teintes = within(
      screen.getByRole('radiogroup', { name: 'Votre couleur' }),
    ).getAllByRole('radio');
    expect(teintes).toHaveLength(8);
    expect(teintes.filter((t) => t.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  });

  it('change la couleur transmise', async () => {
    monter();
    await seanceAnnoncee();

    fireEvent.click(screen.getByRole('radio', { name: 'Turquoise' }));
    fireEvent.change(screen.getByLabelText('Code de la séance'), { target: { value: 'JEUDI7' } });
    fireEvent.click(screen.getByRole('button', { name: /Rejoindre/ }));

    await waitFor(() => expect(onRejoindre).toHaveBeenCalledOnce());
    expect(onRejoindre.mock.calls[0]?.[2]).toBe('turquoise');
  });
});

/* ------------------------------------------------------------------- le lieu */

/**
 * En salle ou en visio.
 *
 * **Ce n'est pas un détail de confort.** La séance est hybride : une partie de
 * la pièce voit l'écran projeté avec plusieurs secondes de retard. L'animatrice
 * mène la séance différemment selon qui est devant elle, et c'est le participant
 * — seul à le savoir — qui le déclare.
 */
describe('Où l’on suit la séance', () => {
  it('propose les deux lieux, « en salle » par défaut', async () => {
    monter();
    await seanceAnnoncee();

    const lieux = within(
      screen.getByRole('radiogroup', { name: 'Vous suivez la séance' }),
    ).getAllByRole('radio');

    expect(lieux).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'en salle' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('transmet le lieu choisi', async () => {
    monter();
    await seanceAnnoncee();

    fireEvent.click(screen.getByRole('radio', { name: 'en visio' }));
    fireEvent.change(screen.getByLabelText('Code de la séance'), { target: { value: 'JEUDI7' } });
    fireEvent.click(screen.getByRole('button', { name: /Rejoindre/ }));

    await waitFor(() => expect(onRejoindre).toHaveBeenCalledOnce());
    expect(onRejoindre.mock.calls[0]?.[3]).toBe('visio');
  });

  it('transmet « salle » quand on ne touche à rien', async () => {
    monter();
    await seanceAnnoncee();

    fireEvent.change(screen.getByLabelText('Code de la séance'), { target: { value: 'JEUDI7' } });
    fireEvent.click(screen.getByRole('button', { name: /Rejoindre/ }));

    await waitFor(() => expect(onRejoindre).toHaveBeenCalledOnce());
    expect(onRejoindre.mock.calls[0]?.[3]).toBe('salle');
  });
});
