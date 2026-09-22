import { describe, expect, it } from 'vitest';

import {
  apresUneSerie,
  assiduiteVide,
  clefDuJour,
  serieContinue,
  semaineAffichee,
  semaineDe,
  serieAffichee,
  type Assiduite,
} from '@/lib/serie/assiduite';

/**
 * L'assiduité — trois nombres et sept clés, et deux pièges qui ne se voient
 * qu'en faisant passer le temps.
 *
 * **Le premier : une série se rompt sans qu'on écrive rien.** Personne ne
 * touche la base le jour où l'on ne joue pas. Un test qui n'appellerait que
 * `apresUneSerie` verrait donc une série éternelle.
 *
 * **Le second : la frontière du jour est à Paris.** Une réponse donnée à
 * 23 h 30 en hiver appartient au jour civil français, pas au jour UTC — qui a
 * une heure de retard. En été, l'écart est de deux heures.
 */

function assiduite(remplacements: Partial<Assiduite> = {}): Assiduite {
  return { ...assiduiteVide(), ...remplacements };
}

/* ----------------------------------------------------------- la clé du jour */

describe('La clé du jour', () => {
  it('rend une date de calendrier en AAAA-MM-JJ', () => {
    expect(clefDuJour(new Date('2026-03-19T12:00:00Z'))).toBe('2026-03-19');
  });

  /*
   * **Le cas qui compte.** 23 h 30 UTC un 19 janvier, c'est déjà le 20 à
   * Paris — heure d'hiver, une heure d'avance. Calculer en UTC déplacerait la
   * frontière du jour, et « hier » cesserait d'être le même pour tout le monde.
   */
  it('bascule à minuit heure de Paris, pas à minuit UTC', () => {
    expect(clefDuJour(new Date('2026-01-19T23:30:00Z'))).toBe('2026-01-20');
    expect(clefDuJour(new Date('2026-01-19T22:30:00Z'))).toBe('2026-01-19');
  });

  it('tient compte de l’heure d’été', () => {
    // Fin juillet, Paris est à UTC+2 : 22 h 30 UTC est déjà le lendemain.
    expect(clefDuJour(new Date('2026-07-19T22:30:00Z'))).toBe('2026-07-20');
  });
});

/* ------------------------------------------------- la continuité de la série */

describe('La continuité de la série', () => {
  it('tient d’un jour ouvré au suivant', () => {
    expect(serieContinue('2026-03-18', '2026-03-19')).toBe(true);
  });

  /*
   * **Le défaut que ce test existe pour attraper.** La première version
   * comparait au jour calendaire précédent : un commercial qui travaille du
   * lundi au vendredi voyait sa série repartir à un chaque lundi, et son record
   * plafonner à cinq. « Dix jours d'affilée » devenait inatteignable, alors que
   * la maquette neutralise le week-end — on ne peut pas à la fois ne rien
   * demander le samedi et le compter comme une absence.
   */
  it('franchit le week-end : vendredi puis lundi, la série tient', () => {
    // 2026-03-20 est un vendredi, 2026-03-23 le lundi suivant.
    expect(serieContinue('2026-03-20', '2026-03-23')).toBe(true);
  });

  it('se rompt dès qu’un jour ouvré est manqué', () => {
    // Vendredi puis mardi : le lundi a été sauté.
    expect(serieContinue('2026-03-20', '2026-03-24')).toBe(false);
    expect(serieContinue('2026-03-17', '2026-03-19')).toBe(false);
  });

  /* Jouer un samedi ne rompt rien : la série compte les jours joués, le
     calendrier ouvré ne décide que des absences qui la brisent. */
  it('accepte un samedi joué, puis le lundi', () => {
    expect(serieContinue('2026-03-21', '2026-03-23')).toBe(true);
    expect(serieContinue('2026-03-20', '2026-03-21')).toBe(true);
  });

  /*
   * **Le 29 mars 2026 est le passage à l'heure d'été.** Une arithmétique qui
   * repasserait par le fuseau y perdrait une heure et pourrait sauter un jour.
   */
  it('reste juste autour du changement d’heure', () => {
    // Vendredi 27 mars puis lundi 30 : le changement a lieu le dimanche 29.
    expect(serieContinue('2026-03-27', '2026-03-30')).toBe(true);
    expect(serieContinue('2026-03-27', '2026-03-31')).toBe(false);
  });

  it('refuse un jour qui n’avance pas, et une absence longue', () => {
    expect(serieContinue('2026-03-19', '2026-03-19')).toBe(false);
    expect(serieContinue('', '2026-03-19')).toBe(false);
    expect(serieContinue('2026-02-19', '2026-03-19')).toBe(false);
  });
});

/* --------------------------------------------------------------- la semaine */

describe('La semaine', () => {
  it('commence le lundi et compte sept jours', () => {
    // Le 19 mars 2026 est un jeudi.
    expect(semaineDe('2026-03-19')).toEqual([
      '2026-03-16',
      '2026-03-17',
      '2026-03-18',
      '2026-03-19',
      '2026-03-20',
      '2026-03-21',
      '2026-03-22',
    ]);
  });

  /* Le dimanche ferme la semaine, il ne l'ouvre pas. */
  it('range le dimanche en fin de semaine', () => {
    expect(semaineDe('2026-03-22')[6]).toBe('2026-03-22');
    expect(semaineDe('2026-03-22')[0]).toBe('2026-03-16');
  });
});

/* ------------------------------------------------------- après une série */

describe('Après une série terminée', () => {
  it('ouvre la série au premier jour', () => {
    expect(apresUneSerie(assiduiteVide(), '2026-03-19')).toEqual({
      dernierJour: '2026-03-19',
      serie: 1,
      record: 1,
      semaine: ['2026-03-19'],
    });
  });

  it('allonge la série quand la veille était active', () => {
    const apres = apresUneSerie(
      assiduite({
        dernierJour: '2026-03-18',
        serie: 3,
        record: 5,
        semaine: ['2026-03-16', '2026-03-17', '2026-03-18'],
      }),
      '2026-03-19',
    );
    expect(apres.serie).toBe(4);
    expect(apres.semaine).toHaveLength(4);
  });

  it('repart à un après un jour ouvré manqué', () => {
    const apres = apresUneSerie(
      assiduite({
        dernierJour: '2026-03-17',
        serie: 6,
        record: 6,
        semaine: ['2026-03-16', '2026-03-17'],
      }),
      '2026-03-19',
    );
    expect(apres.serie).toBe(1);
  });

  /*
   * **C'est la régularité qui est mesurée, pas le volume.** Trois séries le
   * jeudi ne valent pas trois jours.
   */
  it('ne compte qu’une fois deux séries le même jour', () => {
    const premiere = apresUneSerie(assiduiteVide(), '2026-03-19');
    const seconde = apresUneSerie(premiere, '2026-03-19');
    expect(seconde.serie).toBe(1);
    expect(seconde.semaine).toEqual(['2026-03-19']);
  });

  it('ne fait jamais redescendre le record', () => {
    const apres = apresUneSerie(
      assiduite({ dernierJour: '2026-03-10', serie: 9, record: 9, semaine: [] }),
      '2026-03-19',
    );
    expect(apres.serie).toBe(1);
    expect(apres.record).toBe(9);
  });

  /*
   * **La borne est ici, et elle vaut pour toujours.** Une semaine passée est
   * purgée à l'écriture : le champ ne peut pas dépasser sept entrées, quel que
   * soit le nombre d'années d'usage.
   */
  it('purge les jours d’une semaine passée', () => {
    const apres = apresUneSerie(
      assiduite({
        dernierJour: '2026-03-13',
        serie: 5,
        record: 5,
        semaine: ['2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13'],
      }),
      '2026-03-19',
    );
    expect(apres.semaine).toEqual(['2026-03-19']);
  });

  it('ne dépasse jamais sept jours, même en jouant tous les jours', () => {
    let etat = assiduiteVide();
    for (const jour of semaineDe('2026-03-19')) etat = apresUneSerie(etat, jour);
    expect(etat.semaine).toHaveLength(7);
    expect(etat.serie).toBe(7);

    etat = apresUneSerie(etat, '2026-03-23');
    expect(etat.semaine).toEqual(['2026-03-23']);
    expect(etat.serie).toBe(8);
  });

  /*
   * **Une semaine de travail ordinaire : cinq jours, pas de week-end.** C'est
   * le cas qui plafonnait le record à cinq et rendait « dix jours d'affilée »
   * inatteignable.
   */
  it('enchaîne deux semaines ouvrées sans jouer le week-end', () => {
    let etat = assiduiteVide();
    const ouvres = [
      '2026-03-16', '2026-03-17', '2026-03-18', '2026-03-19', '2026-03-20',
      '2026-03-23', '2026-03-24', '2026-03-25', '2026-03-26', '2026-03-27',
    ];
    for (const jour of ouvres) etat = apresUneSerie(etat, jour);
    expect(etat.serie).toBe(10);
    expect(etat.record).toBe(10);
    expect(etat.semaine).toHaveLength(5);
  });
});

/* ----------------------------------------------- ce que l'écran affiche */

describe('La série affichée', () => {
  it('vaut celle de la base quand on a joué aujourd’hui', () => {
    expect(
      serieAffichee(assiduite({ dernierJour: '2026-03-19', serie: 4, record: 9 }), '2026-03-19'),
    ).toBe(4);
  });

  /* La journée n'est pas finie : une série jouée hier tient encore. */
  it('tient encore quand le dernier jour actif est le jour ouvré précédent', () => {
    expect(
      serieAffichee(assiduite({ dernierJour: '2026-03-18', serie: 4, record: 9 }), '2026-03-19'),
    ).toBe(4);
  });

  /*
   * **Le test qui justifie toute la dérivation.** Aucune écriture n'a eu lieu
   * depuis le 17 : la base porte toujours « 4 ». L'écran, lui, doit dire zéro.
   */
  it('tombe à zéro après un jour ouvré sauté, sans qu’aucune écriture ait eu lieu', () => {
    expect(
      serieAffichee(assiduite({ dernierJour: '2026-03-17', serie: 4, record: 9 }), '2026-03-19'),
    ).toBe(0);
  });

  it('vaut zéro quand rien n’a jamais été joué', () => {
    expect(serieAffichee(assiduiteVide(), '2026-03-19')).toBe(0);
  });
});

describe('La semaine affichée', () => {
  it('rend sept jours, du lundi au dimanche', () => {
    const jours = semaineAffichee(assiduiteVide(), '2026-03-19');
    expect(jours).toHaveLength(7);
    expect(jours.map((jour) => jour.lettre)).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
  });

  it('marque les jours joués et distingue ceux qui restent à venir', () => {
    const jours = semaineAffichee(
      assiduite({
        dernierJour: '2026-03-18',
        serie: 3,
        record: 3,
        semaine: ['2026-03-16', '2026-03-17', '2026-03-18'],
      }),
      '2026-03-19',
    );
    expect(jours.map((jour) => jour.fait)).toEqual([true, true, true, false, false, false, false]);
    // Jeudi est arrivé mais pas encore fait ; vendredi, samedi et dimanche non.
    expect(jours.map((jour) => jour.aVenir)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
  });

  /*
   * **Le fond de la pastille suit le jour de la semaine, pas le temps qui
   * passe.** La maquette neutralise samedi et dimanche : il n'y a rien à
   * rattraper un dimanche. Un vendredi à venir se dessine donc comme un lundi
   * manqué, et c'est voulu — la pastille dit « à faire », pas « raté ».
   */
  it('distingue les jours ouvrés du week-end', () => {
    const jours = semaineAffichee(assiduiteVide(), '2026-03-19');
    expect(jours.map((jour) => jour.ouvre)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  /* Même piège que la série : sans filtre à la lecture, la semaine passée
     resterait affichée jusqu'à la série suivante. */
  it('n’affiche rien d’une semaine passée', () => {
    const jours = semaineAffichee(
      assiduite({
        dernierJour: '2026-03-12',
        serie: 4,
        record: 4,
        semaine: ['2026-03-11', '2026-03-12'],
      }),
      '2026-03-19',
    );
    expect(jours.every((jour) => !jour.fait)).toBe(true);
  });
});
