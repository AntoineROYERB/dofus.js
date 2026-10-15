# Plan — Endless Dreams

Statut : **plan validé**, rien n'est implémenté.

## 0. Décisions prises

| Sujet | Décision |
|---|---|
| Nom | **Endless Dreams** |
| Joueurs | coopératif, **1 à 3 joueurs** dans un même groupe |
| Monstres | une salle contient un **groupe de 1 à 6 monstres**, qui grossit avec l'étage et la taille du groupe |
| Accès | débloqué à la **fin du tutoriel** |
| Vie | remise au **maximum à la fin de chaque combat** |
| Coéquipier mort | **revient** au combat suivant (le run ne s'arrête que si tout le groupe tombe) |
| Bonus | la liste du §5, validée. Pas de bonus de soin entre deux combats : la vie y est déjà remise au max |
| Feu ami | **oui**, nos sorts touchent nos alliés |
| Choix de la salle | **le chef seul** |
| Départ d'un joueur | le classement retient **le groupe du départ** |
| Boss | tous les **5 étages** |
| Courbe de difficulté (CI) | victoire > 80 % aux étages 1–4, ~50 % vers l'étage 10, < 20 % après 20 |
| Classement | **dès la V1** |

## 1. Ce qu'on reprend de Dofus

La boucle des Songes infinis : on monte des **étages**. À chaque étage on
**choisit une salle** parmi plusieurs, chacune annonçant ses monstres, ce qui la
rend difficile et ce qu'elle rapporte. Un **boss** revient régulièrement, et des
**modificateurs** changent les règles du combat. La difficulté monte sans
plafond et ce qui compte, c'est **l'étage le plus haut atteint**.

On ne reprend pas l'économie (clés, ressources, équipement) : on n'a ni
inventaire ni comptes.

## 2. Ce que le jeu actuel impose

| Contrainte | Où | Conséquence |
|---|---|---|
| Strictement 1v1 : `MaxPlayersPerRoom = MinPlayers = 2`, fin de combat = « un seul vivant » | `game/lobby.go`, `game/game.go` (`checkGameOverLocked`) | Le moteur doit apprendre les **équipes** : c'est le plus gros chantier (§6.1), avec sa propre ADR. |
| Les adversaires sont les 4 classes, en kit de 5 sorts | `config/classes.json` | Il faut des **monstres** plus simples que des classes pour remplir une salle de 6 (§4.2). |
| Le bot joue une action par tick, et `nearestEnemy` vise « tout le monde sauf moi » | `game/bot.go` | Le bot doit viser **l'autre équipe**, et le rythme doit tenir avec 6 bots (§6.1). |
| Le serveur est l'arbitre, le client n'est jamais cru | README | Étage, salles, bonus et classement sont **décidés par le serveur**. |
| Pas de comptes, serveur en mémoire qui s'endort | README | Le run vit dans le **store** (Postgres s'il est configuré, mémoire sinon), avec une clé par joueur pour y revenir (§7). |
| Un match = seed + commandes acceptées, rejoué en CI | ADR 0001 | Équipes, monstres, modificateurs et bonus sont **des entrées du match** : ils vont dans la `Recording` et l'empreinte des règles. |
| Le contenu est du JSON validé au démarrage | `content/validate.go` | Monstres, salles, modificateurs, boss et bonus vivent dans `config/dream.json`, validé pareil. |
| L'équilibre est un test en CI | balance sim | On ajoute une **courbe de difficulté** pour 1, 2 et 3 joueurs (§9). |

## 3. La boucle de jeu

```
Fin du tutoriel ─► Lobby ─► « Endless Dreams »
                              │ créer un groupe (seul, ou code à partager, 3 max)
                              ▼
                     Étage N : 3 salles
                     (monstres + modificateur + difficulté)
                              │ le chef de groupe choisit
                              ▼
                     Combat : groupe vs groupe de monstres
                              │
          tout le groupe ◄────┴────► monstres tous tombés
          est tombé                        │
              │                   chaque joueur choisit 1 bonus parmi 3
       Fin du run :               PV remis au max, morts relevés
       étage atteint ─► classement         │
                                           ▼
                                 Étage N+1 (boss tous les 5 étages)
```

- **Groupe** : créé depuis le lobby, rejoint par un code (comme une salle
  aujourd'hui). Le chef lance le run ; personne ne rejoint en cours de run en V1.
- **Classe** : celle de chaque joueur, fixée pour tout le run. Deux joueurs
  peuvent prendre la même.
- **Choix de la salle** : le chef décide. Les autres voient les salles et
  peuvent en « pointer » une, ce que le chef voit.
- **Choix des bonus** : chacun le sien, en même temps, 30 s maximum (sinon le
  premier est pris pour lui).
- **Boss** : tous les **5 étages**, pour qu'un palier tienne en ~15 minutes.
- **Vie** : remise au max entre deux combats ; les morts reviennent.
- **Départ d'un joueur** : il quitte le run ; le groupe continue s'il reste
  quelqu'un. Le classement retient la composition au départ du run.

## 4. Le contenu des salles

### 4.1 Les salles

À chaque étage, le serveur tire **3 salles** à partir de
`(seed du run, étage, taille du groupe)`. Une salle annonce :

- **le groupe de monstres** : qui, combien, avec leurs PV ;
- **un modificateur** (§4.4), parfois deux à haut étage ;
- **une difficulté** (Calme / Agitée / Cauchemar), qui fixe la rareté des
  bonus offerts après la victoire.

### 4.2 Les monstres

Les classes restent les « gros » adversaires (boss, élites). Pour remplir une
salle, on ajoute des **monstres de rêve**, déclarés dans `dream.json` :

- 1 à 3 sorts pris dans `spells.json` (ou des sorts propres au songe) ;
- des PV, PA, PM et un **coût** en points de menace ;
- un élément, une couleur, un nom.

Exemples de départ (un par élément, plus des neutres) :

| Monstre | Rôle | Kit | Coût |
|---|---|---|---|
| Ember Wisp | faible, à distance | une brûlure | 1 |
| Gust Imp | rapide, repousse | un coup + une poussée | 1 |
| Brine Crab | lent, solide | un coup, beaucoup de PV | 2 |
| Pebble Golem | bloque | un coup + un pilier | 2 |
| Dream Echo | copie réduite d'une classe | 3 sorts de la classe | 3 |
| Nightmare (élite) | une classe complète | 5 sorts | 5 |

### 4.3 Taille des groupes

Une salle a un **budget de menace** :

```
budget(étage, joueurs) = base(étage) × facteur(joueurs) × facteur(difficulté)
facteur(joueurs)       = 1 / 1,8 / 2,5      (1, 2, 3 joueurs)
```

Le générateur dépense le budget en monstres, **6 au plus**. À bas étage on
tombe sur 1 ou 2 monstres faibles ; plus haut, on voit des groupes de 4 à 6, ou
moins de monstres mais plus lourds. Au-delà de 6, la difficulté monte par les
stats (PV, PA) et par les modificateurs, pas par le nombre.

Les nombres exacts sortent de la simulation (§9).

### 4.4 Les modificateurs (« Twists »)

Des règles appliquées au combat entier, construites sur ce que le moteur sait
déjà faire :

| Twist | Effet | Réutilise |
|---|---|---|
| Burning Ground | 6 cellules de feu au départ | `terrain` |
| Fog | une bande de fumée au centre | `terrain` |
| Frozen Edge | glace sur les bords | `terrain` |
| Thick Hide | monstres +30 % PV | stats |
| Heavy Limbs | tout le monde −1 PM, +1 PA | `turnPoints` |
| Short Night | tours de 30 s | `TurnDuration` |
| Open Field | aucun couvert | `GenerateObstacles` |
| Swarm | +1 monstre faible gratuit | composition |

### 4.5 Les boss

Tous les 5 étages : une classe complète sous une identité de songe (nom, deux
répliques), PV × 2 × joueurs, un twist imposé, **son ultime dès le tour 1**, et
une escorte de monstres faibles à partir de l'étage 10.

## 5. Les bonus (« Boons »)

Après chaque victoire, chaque joueur reçoit **3 bonus au choix**, tirés selon
la difficulté de la salle. Ils durent **jusqu'à la fin du run** et s'empilent.

Les bonus de type **sort de songe** ajoutent un sort à la barre du joueur (la
barre accepte jusqu'à 8 sorts, les classes en ont 5) : ce sont des actions à
utiliser pendant le combat, une fois par combat sauf mention contraire.

### Communs

| Bonus | Effet |
|---|---|
| Vigor | +10 PV max |
| Stride | +1 PM |
| Thick Skin | −1 dégât sur chaque coup reçu |
| Sharpened | +10 % dégâts de tous vos sorts |
| Long Arm | +1 portée sur un sort au choix |
| Quick Hands | −1 PA sur un sort au choix (minimum 1) |
| Head Start | +2 PM au premier tour de chaque combat |

### Rares

| Bonus | Effet |
|---|---|
| Focus | +1 PA |
| Wake Up | **sort de songe** : relève un allié tombé ce combat à 40 % de ses PV, une fois par combat |
| Shared Strength | tous les alliés à 2 cases ou moins de vous gagnent +1 PA au début de leur tour |
| Class passive+ | renforce le passif de la classe : brûlures jusqu'à 4 (Pyromancer), relais +2 portée (Windwalker), pièges qui gèlent (Tidecaller), +1 résistance à la poussée (Stonewarden) |
| Twice | un sort au choix peut être lancé une fois de plus par tour |

### Légendaires (salles Cauchemar, boss)

| Bonus | Effet |
|---|---|
| Second Wind | une fois par run, au lieu de tomber, vous restez à 1 PV |
| Early Ultimate | votre ultime est disponible dès le tour 1 |
| Dream Shield | au début de chaque combat, tout le groupe a un bouclier de 15 PV |
| Overflow | les PA non dépensés passent au tour suivant (2 au plus) |

Tous les bonus sont des **données** dans `dream.json` (id, rareté, classe
éventuelle, effet). Les effets possibles sont une liste fermée validée au
démarrage, comme les `special` des sorts : `stat`, `spell_mod`, `grant_spell`,
`passive`, `aura`, `rule`.

## 6. Ce qu'il faut changer, par couche

### 6.1 Moteur : les équipes (le gros morceau, ADR 0002)

1. `Player.Team` (`"party"` / `"dream"`). `checkGameOverLocked` : le combat
   s'arrête quand **une équipe** n'a plus personne debout.
2. Capacité par mode : la salle d'un songe accepte jusqu'à 3 humains + 6 monstres.
   Le 1v1 classique ne change pas (`MaxPlayersPerRoom` reste à 2 pour lui).
3. Placement : un bloc de départ **par équipe**, assez de cellules pour 6.
   Le plateau (losange de rayon 7, 113 cellules) suffit.
4. Ordre de jeu : on **alterne les équipes** (joueur, monstre, joueur, monstre…,
   les monstres en trop jouent à la suite), tiré une fois comme aujourd'hui.
5. Ciblage : les dégâts touchent tout le monde (feu ami compris, comme dans
   Dofus) ; les sorts « allié » (Wake Up) ne visent que son équipe.
6. Bot : `nearestEnemy` et l'estimation de dégâts ne visent que l'autre équipe ;
   le bot évite de toucher ses alliés.
7. Rythme : avec 6 monstres, le tick des bots est raccourci dans un songe pour
   qu'un tour de monstres ne dure pas une minute.
8. `Recording` : `Version` +1 ; équipe, profil de chaque bot, twists et bonus
   enregistrés. Les matchs de `testdata` rejouent à l'identique.

### 6.2 Moteur : profils et règles du songe

9. `AddBotOfClass` devient `AddBotProfile(profile)` : nom, sorts, PV, PA, PM,
   équipe.
10. `Options.Dream *DreamSetup` : twists, bonus de chaque joueur. Appliqué au
    placement (terrain initial, obstacles, stats, sorts ajoutés).
11. Nouvelles règles pour les bonus qui en demandent : bouclier, report de PA,
    « Second Wind », sort `revive`.
12. `dream.go` : `FloorRooms(seed, floor, players)`, `FloorBoons(seed, floor,
    player, tier)`, `ThreatBudget(...)`, fonctions pures.

### 6.3 Contenu

13. `config/dream.json` : monstres, twists, boss, bonus, paliers de budget.
14. Validation : sorts inconnus, effets inconnus, monstre de coût nul, bonus qui
    vise un sort absent de la classe, etc.

### 6.4 Réseau

15. Groupe : `dream_party_create`, `dream_party_join` (code),
    `dream_party_start`.
16. Étage : `dream_floor` (3 salles), `dream_point` (suggérer une salle),
    `dream_enter` (chef) → ouvre la salle du combat.
17. Après le combat : `dream_result` (bonus offerts, ou fin du run) →
    `dream_boon` (choix de chacun) → étage suivant.
18. `dream_resume` (clé du joueur) pour revenir dans un run après une
    déconnexion ou un redémarrage.

### 6.5 Client

19. Lobby : bouton **Endless Dreams**, grisé tant que le tutoriel n'est pas fini
    (`tutorialStorage.ts`).
20. Écran du groupe : membres, classes, code à partager, « Lancer ».
21. Écran de l'étage : 3 salles en cartes (monstres avec PV, twist,
    difficulté), suggestions des coéquipiers, choix du chef.
22. Écran des bonus : 3 cartes, minuteur, qui a déjà choisi.
23. En combat : bandeau « Floor 7 · Fog », bonus actifs dans le rail / HUD
    téléphone, couleur d'équipe sur la frise des tours (`TurnTimeline`) et sur
    le socle des personnages.
24. Fin du run : étage atteint, bonus pris, rang au classement.
25. Écran du **classement**.

## 7. Où vit le run

Un run traverse plusieurs combats et doit survivre à un serveur qui s'endort ;
avec un classement et un groupe, il ne peut plus vivre seulement chez le client.

- Le run est **dans le store** (`internal/store`, Postgres si configuré,
  mémoire sinon), sauvegardé à chaque **fin d'étage** : seed, étage, membres,
  bonus de chacun, enregistrement de chaque combat.
- Chaque joueur reçoit une **clé de run** aléatoire, gardée en `localStorage` :
  c'est elle qui lui permet de revenir (rechargement, réseau coupé, serveur
  réveillé).
- Si le serveur redémarre en plein combat, le groupe reprend **au début de cet
  étage**, avec les mêmes salles (elles sont dérivées du seed).
- Rien ne vient du client : l'étage n'avance que quand le serveur a vu le
  combat se terminer dans sa propre salle.

## 8. Le classement

- Trois tableaux : **Solo, Duo, Trio**.
- Une entrée = noms et classes du groupe, étage atteint, nombre total de tours
  (départage : moins de tours = mieux), date.
- Écrit **par le serveur seulement**, à la fin d'un run, à partir de ce qu'il a
  vu : un client ne peut pas envoyer un score.
- Chaque entrée garde les enregistrements de ses combats : on peut **rejouer**
  n'importe quel étage d'un run classé (la page de replay existe déjà).
- Sans comptes, les noms ne sont pas uniques : deux « Antoine » peuvent avoir
  chacun leur ligne. Acceptable en V1.
- Sans Postgres (mode mémoire), le classement disparaît au redémarrage. En
  production, il faut donc Postgres.
- API : `GET /api/dreams/leaderboard?size=1|2|3`, sur le modèle de
  `api/matches.go`.

## 9. Tests et équilibre

- **Équipes** : fin de combat par équipe, ordre alterné, feu ami, sorts alliés,
  rejeu exact des anciens matchs.
- **Déterminisme** : mêmes salles et bonus pour le même `(seed, étage, taille)`.
- **Contenu** : un `dream.json` cassé arrête le serveur avec fichier, champ,
  problème.
- **Run** : on ne peut pas choisir une salle ou un bonus qui n'a pas été
  offert ; un non-chef ne peut pas entrer ; une clé de run d'un autre joueur
  est refusée.
- **Courbe de difficulté** (le test qui compte) : des bots jouent le rôle des
  joueurs, en solo, duo et trio, sur des seeds fixes. Seuils retenus :
  victoire > 80 % aux étages 1–4, ~50 % vers l'étage 10, < 20 % après 20, et
  aucune taille de groupe qui monte deux fois plus haut qu'une autre en
  moyenne.

## 10. Découpage en PR (depuis `develop`)

1. **ADR 0002 + équipes dans le moteur** : `Team`, fin de combat, placement,
   ordre alterné, bot qui vise l'autre équipe. Testé en 2v2 bot contre bot.
   Aucun changement visible pour le 1v1.
2. **Profils de bot + monstres** : `AddBotProfile`, `dream.json` (monstres),
   validation.
3. **Règles du songe** : twists, bonus, nouveaux effets (`revive`,
   bouclier…), `Recording` v+1.
4. **Run et groupe côté serveur** : store, messages, clé de run, reprise.
5. **Client** : groupe, étage, bonus, bandeau en combat, couleurs d'équipe.
6. **Classement** : store + API + écran.
7. **Équilibre** : courbe en CI, réglage des nombres.
8. **Finitions** : README, captures, haptique iOS sur un boss vaincu.

## 11. Plus tard (hors V1)

- **Songe de la semaine** : un seed commun à tout le monde, avec son classement.
- **IA par palier** : des monstres plus malins à haut étage (soigneurs,
  protecteurs).
- Rejoindre un run en cours entre deux étages.

## 12. Questions ouvertes

Aucune pour l'instant.
