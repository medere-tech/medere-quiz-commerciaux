# SYNTHESE.md — Application d'entraînement commerciaux

> À lire en premier. Cinq minutes. Ce document dit ce que la recherche a établi, ce qui est décidé, ce qui ne l'est pas, et par où commencer.
> Recherche menée le 1er septembre 2026 sur sources primaires.

---

## 1. Le projet en une phrase

Une application interne où une dizaine de commerciaux s'entraînent par le quiz sur le catalogue de formations Médéré et les liens entre elles, avec correction immédiate, mémoire des questions ratées, et une session collective animée par Noémie chaque jeudi.

Demande d'origine : Noémie, validée par Harry. Objectif métier annoncé par elle : *augmenter la connaissance des formations et des liens entre elles, pour améliorer les ventes.*

---

## 2. Ce que la recherche a changé

Trois points où ce que j'aurais écrit de mémoire était faux ou dépassé. C'est la raison d'être de cette étape.

### 2.1 Claude Code : la structure a évolué

La documentation officielle (`code.claude.com/docs/en/memory`, consultée le 1er septembre 2026) est explicite sur deux points que la pratique courante ignore encore :

**Le CLAUDE.md doit rester sous 200 lignes.** Au-delà, il consomme du contexte et *l'adhésion aux instructions baisse*. Un CLAUDE.md monolithique de 40 Ko est contre-productif. Les fichiers de plus de 4 MiB sont purement ignorés.

**Les `@imports` ne réduisent pas le contexte.** Les fichiers importés sont chargés au lancement comme le reste. Découper pour organiser, oui ; découper pour alléger, non.

**Le bon mécanisme, c'est `.claude/rules/` avec un frontmatter `paths:`.** Une règle scopée par chemin ne se charge que lorsque Claude lit un fichier correspondant. C'est ce qui permet d'avoir des instructions détaillées sur la sécurité Firestore sans les payer à chaque session. C'est le changement structurel le plus important, et c'est pour ça que ce repo est organisé comme il l'est.

Dernier point à retenir : **CLAUDE.md est du contexte, pas une contrainte.** Rien n'y est garanti. Ce qui doit être imposé s'encode dans les tests, le lint, les hooks ou la CI — pas dans une phrase en gras.

### 2.2 Airtable : la protection est réelle et vérifiable

Le jeton d'accès personnel Airtable est un objet de permission à **deux dimensions** : les *scopes* définissent ce que le jeton peut faire, l'*accès base/workspace* définit où il peut le faire. Un scope absent rend l'opération impossible, même sur une base autorisée.

Conséquence directe pour ta contrainte : un jeton créé avec `data.records:read` et `schema.bases:read` uniquement, restreint à la seule base formations, **ne peut physiquement pas écrire**. Ce n'est pas une discipline de développement, c'est une impossibilité technique. C'est la réponse à ton exigence.

Deux détails à connaître : les jetons Airtable **n'expirent pas** (ils ne cessent de fonctionner que s'ils sont supprimés, régénérés ou modifiés), et le **nom du jeton apparaît dans l'historique de révision des enregistrements** — donc un nom explicite, pas « test ».

### 2.3 Firebase : le vrai risque n'est pas le coût, c'est le partage de quota

Chiffres officiels vérifiés (`firebase.google.com/docs/firestore/pricing`) : le plan Blaze **conserve les quotas gratuits** du plan Spark, à savoir 50 000 lectures, 20 000 écritures et 20 000 suppressions par jour, 1 GiB stocké, 10 GiB de sortie mensuelle. Les quotas se réinitialisent quotidiennement vers minuit heure du Pacifique.

Estimation pour notre usage : douze commerciaux, trois séries de dix questions par jour, soit environ 400 écritures quotidiennes. Nous sommes à 2 % du quota gratuit. **Coût attendu : zéro.**

Mais deux réserves sérieuses :

**Le quota gratuit ne s'applique qu'à une seule base par projet, et il se compte au niveau du projet.** Si tu réutilises un projet Firebase existant, tu partages le quota avec l'application qui s'y trouve déjà. → **Créer un projet Firebase dédié.**

**Blaze n'a pas de plafond de dépense strict.** C'est la source de toutes les mauvaises surprises documentées. → **Poser une alerte budgétaire dès la création du projet**, avant la première ligne de code.

### 2.4 Le piège des rôles administrateurs

Les custom claims Firebase ne sont pas rafraîchis en continu : la nouvelle valeur n'apparaît côté client et dans les règles de sécurité **qu'après rafraîchissement du jeton d'identité**, ce qui prend jusqu'à une heure. Quand tu donneras le rôle admin à Noémie, elle devra se déconnecter et se reconnecter, ou l'application devra forcer `getIdToken(true)`.

Corollaire de sécurité, documenté partout : **ne jamais utiliser un champ Firestore du type `users/{uid}.isAdmin` pour l'autorisation.** Un client peut modifier son propre document si une règle d'écriture est mal calibrée. Le rôle passe par un custom claim, posé côté serveur.

---

## 3. Ce qui est décidé

| Sujet | Décision | Qui a tranché |
|---|---|---|
| Formats de questions | Vrai/faux, QCM à réponses multiples, mise en situation — les trois dès la V1 | Déthié |
| Scores individuels | Privés en V1, garantis par la structure des données et non par l'affichage | Déthié |
| Session du jeudi | Hybride visio + présentiel, question poussée sur l'appareil de chaque participant | Déthié |
| Base de données | Firestore, projet dédié | Déthié |
| Airtable | Lecture seule, référentiel formations uniquement | Déthié |
| Interface | Aucun emoji, jeu d'icônes unique, aucune bordure sur un seul côté, qualité SaaS premium | Déthié |
| Design | Réalisé par Claude Design, V1 livrée | Déthié |
| Volume | ~10 commerciaux + Noémie | Déthié |

---

## 4. Ce qui n'est pas décidé

À trancher avant ou pendant le lot 1. Rien ici n'est bloquant pour démarrer, mais tout doit être réglé avant la mise en service.

1. **Identifiants du projet Firebase** — projet à créer, dédié.
2. **Base et table Airtable** — identifiant de base, nom exact de la table formations, noms exacts des champs à lire.
3. **Comptes administrateurs** — l'adresse de Noémie, et la tienne.
4. **Domaine de messagerie** à autoriser pour l'authentification.
5. **Volume de questions au lancement.** Le point de risque numéro un du projet. En dessous d'environ 150 questions publiées, les commerciaux bouclent la banque en deux sessions et décrochent. À confirmer avec Noémie : combien de questions prêtes aujourd'hui, quel rythme d'ajout ensuite.
6. **Sponsor côté commercial.** Jordan est-il dans la boucle ? Sans rituel porté par le directeur commercial, l'usage retombe. Ce n'est pas une question technique, c'est celle qui décide si le projet sert à quelque chose.

---

## 5. Les fichiers de ce dépôt

| Fichier | Pour qui | Rôle |
|---|---|---|
| `SYNTHESE.md` | Toi | Ce document. Point d'entrée. |
| `README.md` | Toi et Claude Code | Documentation technique de référence : architecture, modèle de données, règles de sécurité, algorithmes, phases. |
| `CLAUDE.md` | Claude Code | Chargé automatiquement à chaque session. Court par conception. |
| `.claude/rules/securite.md` | Claude Code | Règles de sécurité, scopées aux fichiers concernés. |
| `.claude/rules/airtable.md` | Claude Code | Règles Airtable, scopées à l'intégration. |
| `.claude/rules/interface.md` | Claude Code | Règles d'interface, scopées au front. |
| `.env.example` | Toi | Variables à renseigner. |
| `.gitignore` | — | Protection des secrets. |

---

## 6. Par où commencer

**Aujourd'hui.** Tu lis ce document. Tu crées le projet Firebase dédié et tu y poses une alerte budgétaire. Tu crées le jeton Airtable en lecture seule, restreint à la base formations. Tu renseignes `.env.local` à partir de `.env.example`.

**Ensuite.** Tu poses à Noémie les deux questions de la section 4 : volume de questions, et Jordan dans la boucle.

**Puis.** Tu crées le dépôt, tu y places ces fichiers à la racine, tu ouvres Claude Code et tu lances le lot 1 décrit dans le `README.md`. Un lot, une validation, on ne passe pas au suivant sans que le précédent tourne.

---

## 7. Sources

- Claude Code, mémoire et CLAUDE.md — https://code.claude.com/docs/en/memory
- Airtable, jetons d'accès personnels — https://airtable.com/developers/web/guides/personal-access-tokens
- Airtable, création de jetons — https://support.airtable.com/docs/creating-personal-access-tokens
- Firestore, tarification et quotas — https://firebase.google.com/docs/firestore/pricing
- Firebase, règles de sécurité et authentification — https://firebase.google.com/docs/rules/rules-and-auth
- Firebase, custom claims — https://firebase.google.com/docs/auth/admin/custom-claims
