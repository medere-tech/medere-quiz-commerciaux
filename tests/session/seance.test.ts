import { describe, expect, it } from 'vitest';

import {
  animatricePar,
  descriptionAffichable,
  dureeAnnonceeMinutes,
  dureeEcouleeMinutes,
  nomAffichable,
  ouvertureEnToutesLettres,
  resumeSeance,
  titreAffichable,
  titreDeSeance,
  titreParDefaut,
} from '@/lib/session/seance';

/**
 * Ce qu'une séance annonce d'elle-même.
 *
 * **Deux règles à tenir, et elles se contredisent si on les écrit mal :** un
 * titre jamais vide, une durée jamais inventée. La première demande un repli ;
 * la seconde interdit d'en avoir un. Ces tests existent pour que le repli reste
 * du côté du titre et jamais du côté des chiffres.
 */

describe('titreAffichable', () => {
  it('retire les caractères de contrôle, qui casseraient la mise en page', () => {
    expect(titreAffichable('Objections\nsur les\tclasses')).toBe('Objectionssur lesclasses');
  });

  it('coupe à soixante caractères', () => {
    expect(titreAffichable('a'.repeat(200))).toHaveLength(60);
  });

  it('rend une chaîne vide pour un titre qui n’est que des espaces', () => {
    expect(titreAffichable('   ')).toBe('');
  });
});

describe('descriptionAffichable', () => {
  it('accepte le vide : la description est facultative', () => {
    expect(descriptionAffichable('')).toBe('');
  });

  it('coupe à cent soixante caractères', () => {
    expect(descriptionAffichable('b'.repeat(400))).toHaveLength(160);
  });
});

describe('nomAffichable', () => {
  it('borne à trente-deux caractères, comme les règles', () => {
    expect(nomAffichable('c'.repeat(80))).toHaveLength(32);
  });
});

describe('titreParDefaut', () => {
  it('nomme la séance par son jour', () => {
    // 18 septembre 2026 est un vendredi.
    expect(titreParDefaut(new Date('2026-09-18T10:00:00Z'))).toBe(
      'Séance du vendredi 18 septembre',
    );
  });
});

describe('titreDeSeance', () => {
  it('rend le titre saisi quand il y en a un', () => {
    expect(titreDeSeance({ titre: 'Objections sur les classes virtuelles' })).toBe(
      'Objections sur les classes virtuelles',
    );
  });

  /*
   * Le cas qui compte : un titre vide ne doit jamais produire un blanc sur un
   * écran projeté devant dix personnes.
   */
  it('retombe sur la date de création quand le titre est vide', () => {
    expect(
      titreDeSeance({ titre: '   ', creeeLeMs: Date.parse('2026-09-17T09:00:00Z') }),
    ).toBe('Séance du jeudi 17 septembre');
  });

  it('retombe sur un nom générique quand même la date manque', () => {
    expect(titreDeSeance({ titre: '', creeeLeMs: null })).toBe('Séance collective');
  });

  it('se passe entièrement du champ, qui peut ne pas exister', () => {
    expect(titreDeSeance({})).toBe('Séance collective');
  });
});

describe('dureeAnnonceeMinutes', () => {
  /*
   * **Le temps de commentaire ne dépend pas du chronomètre.**
   *
   * Le lot 9 doublait la durée de vote, ce qui faisait croître le commentaire
   * avec le chronomètre : à soixante secondes par question, il prétendait
   * qu'on commenterait une minute. La maquette de la page 7 remplace cette
   * approximation par une mesure du rythme réel — répondre, puis quarante-cinq
   * secondes pour révéler et commenter, quelle que soit la cadence.
   */
  it('ajoute un temps de commentaire fixe à chaque question', () => {
    // 8 × (45 + 45) = 720 s = 12 min.
    expect(
      dureeAnnonceeMinutes({ questionIds: Array(8).fill('q'), dureeQuestionSecondes: 45 }),
    ).toBe(12);
  });

  it('ne fait pas croître le commentaire avec le chronomètre', () => {
    const court = dureeAnnonceeMinutes({
      questionIds: Array(8).fill('q'),
      dureeQuestionSecondes: 20,
    });
    const long = dureeAnnonceeMinutes({
      questionIds: Array(8).fill('q'),
      dureeQuestionSecondes: 60,
    });

    // Quarante secondes d'écart par question, et pas le double du total.
    expect(long! - court!).toBe(Math.round((8 * 40) / 60));
  });

  it('arrondit à la minute, et non à cinq', () => {
    // 10 × (60 + 45) = 1050 s = 17,5 min → 18. Un multiple de cinq aurait
    // rendu « 20 » : la même estimation, en moins précise.
    expect(
      dureeAnnonceeMinutes({ questionIds: Array(10).fill('q'), dureeQuestionSecondes: 60 }),
    ).toBe(18);
  });

  /*
   * La règle la plus importante du lot 9, et elle tient : un chronomètre à
   * zéro veut dire « au rythme de la parole », pas « zéro minute ».
   */
  it('rend null quand aucun chronomètre ne cadence la séance', () => {
    expect(
      dureeAnnonceeMinutes({ questionIds: Array(8).fill('q'), dureeQuestionSecondes: 0 }),
    ).toBeNull();
  });

  it('rend null pour une séance sans question', () => {
    expect(dureeAnnonceeMinutes({ questionIds: [], dureeQuestionSecondes: 45 })).toBeNull();
  });

  it('n’annonce jamais zéro minute', () => {
    expect(dureeAnnonceeMinutes({ questionIds: ['q'], dureeQuestionSecondes: 20 })).toBe(1);
  });
});

describe('resumeSeance', () => {
  it('annonce les questions et la durée', () => {
    expect(
      resumeSeance({ questionIds: Array(8).fill('q'), dureeQuestionSecondes: 45 }),
    ).toBe('8 questions, environ 12 minutes');
  });

  it('annonce le rythme de la salle quand rien ne cadence', () => {
    expect(
      resumeSeance({ questionIds: Array(8).fill('q'), dureeQuestionSecondes: 0 }),
    ).toBe('8 questions, au rythme de la salle');
  });

  it('accorde le singulier', () => {
    expect(resumeSeance({ questionIds: ['q'], dureeQuestionSecondes: 0 })).toBe(
      '1 question, au rythme de la salle',
    );
  });
});

/**
 * La durée réellement écoulée.
 *
 * **Une mesure, pas une estimation**, et l'écran ne dit pas « estimées » mais
 * « écoulées ». Les deux ne se confondent pas.
 */
describe('dureeEcouleeMinutes', () => {
  it('mesure entre l’ouverture et la clôture', () => {
    const ouverte = Date.parse('2026-09-17T12:00:00Z');
    expect(
      dureeEcouleeMinutes({ ouverteLeMs: ouverte, termineeLeMs: ouverte + 18 * 60000 }),
    ).toBe(18);
  });

  it('rend null tant que la séance n’est pas close', () => {
    expect(dureeEcouleeMinutes({ ouverteLeMs: Date.now(), termineeLeMs: null })).toBeNull();
  });

  /*
   * Une borne absente donnerait une durée en décennies. On préfère ne rien
   * annoncer : l'écran sait masquer la colonne, il ne sait pas repérer
   * l'absurde.
   */
  it('rend null quand l’ouverture manque', () => {
    expect(dureeEcouleeMinutes({ ouverteLeMs: null, termineeLeMs: Date.now() })).toBeNull();
  });

  it('rend null pour une séance close avant d’être ouverte', () => {
    const instant = Date.now();
    expect(
      dureeEcouleeMinutes({ ouverteLeMs: instant, termineeLeMs: instant - 60000 }),
    ).toBeNull();
  });
});

describe('animatricePar', () => {
  it('rend le nom publié sur la séance', () => {
    expect(animatricePar({ animateurNom: 'Noémie' })).toBe('Noémie');
  });

  /*
   * `null` et non `''` : l'écran doit pouvoir ne pas écrire « animée par » du
   * tout, plutôt que d'écrire « animée par » suivi de rien.
   */
  it('rend null quand le nom n’a pas été publié', () => {
    expect(animatricePar({})).toBeNull();
    expect(animatricePar({ animateurNom: '  ' })).toBeNull();
  });
});

describe('ouvertureEnToutesLettres', () => {
  it('rend null tant que la séance n’est pas ouverte', () => {
    expect(ouvertureEnToutesLettres(null)).toBeNull();
  });

  it('dit le jour et l’heure', () => {
    const texte = ouvertureEnToutesLettres(Date.parse('2026-09-17T12:05:00Z'));
    expect(texte).toMatch(/^Ouverte jeudi à /);
  });

  /*
   * **L'heure française se sépare par un « h », pas par deux points.**
   * `Intl` rend « 15:01 » pour `fr-FR` — c'est ce que dit CLDR, et c'est faux
   * typographiquement. Trouvé à la recette navigateur du lot 9.
   */
  it('sépare l’heure par un « h », jamais par deux points', () => {
    const texte = ouvertureEnToutesLettres(Date.parse('2026-09-17T12:05:00Z')) ?? '';
    expect(texte).not.toMatch(/\d:\d/);
    expect(texte).toMatch(/\d h \d\d$/);
  });

  it('omet les minutes à l’heure juste', () => {
    // Construit en heure locale : la sortie l'est aussi.
    const pile = new Date(2026, 8, 17, 14, 0, 0).getTime();
    expect(ouvertureEnToutesLettres(pile)).toBe('Ouverte jeudi à 14 h');
  });
});
