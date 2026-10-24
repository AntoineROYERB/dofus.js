# Plan — Endless Dreams

Statut : **implémenté** sur la branche `feat/endless-dreams` (locale, non
poussée). Ce document décrit le mode tel qu'il est codé ; les écarts avec la
première version du plan sont signalés en fin de document.

## 0. Décisions

| Sujet | Décision |
|---|---|
| Nom | **Endless Dreams** |
| Joueurs | coopératif, **1 à 3 joueurs** dans un groupe, rejoint par un code |
| Monstres | une salle contient **1 à 6 monstres** du bestiaire |
| Accès | débloqué à la **fin du tutoriel** |
| Vie | remise au **maximum à la fin de chaque combat** ; les morts se relèvent |
| Feu ami | **oui**, nos sorts touchent nos alliés (le bot, lui, ne les vise jamais) |
| Choix de la salle | **le chef seul** ; les autres peuvent pointer une salle |
| Boss | tous les **5 étages** |
| Départ d'un joueur | le classement retient **le groupe du départ** |
| Classement | **dès la V1** : Solo, Duo, Trio |
| Courbe de difficulté (CI) | victoire > 80 % aux étages 1–4, 30–70 % aux étages 8–12, < 20 % à partir de 20 |

## 1. La boucle

```
Lobby (après le tutoriel) ─► /dream
   ouvrir un groupe (code à partager) ou en rejoindre un
            │ le chef lance
            ▼
   Étage N : 3 salles, chacune sur une île
   (monstres de l'île + twists + rareté des bonus)
            │ le chef entre, les autres peuvent pointer
            ▼
   Combat : groupe (équipe "party") contre salle (équipe "dream")
            │
   défaite ◄┴► victoire ── 3 s plus tard, retour au songe
      │                    chacun choisit 1 bonus parmi 3 (30 s)
   Fin du run,             vie remise au max, morts relevés
   classement                       │
                                    ▼
                         Étage N+1 (boss tous les 5)
```

## 2. Le contenu (`backend/config/dreams.json`)

Tout est validé au démarrage (`internal/content/dreams.go`), chaque règle a un
test de refus.

### 2.1 Les îles et les monstres

Une salle est jouée sur une **île** (son terrain, sa palette) et remplie avec
la **lignée** de cette île. Six îles servent aux salles : Prairie, Earth,
Water, Ice, Air, Acid. Chaque monstre du bestiaire a une fiche de combat :

- un **set** complet (élément, passif du grimoire, rune) ;
- une **barre de 1 à 3 sorts**, pris dans la barre de ce set ;
- ses **PV, PA, PM**, un **coût de menace** (1 à 3) et une couleur.

En combat, un monstre est **dessiné avec sa planche du bestiaire**.

### 2.2 Composition d'une salle

```
budget = (baseThreat + threatPerFloor × (étage − 1)) × partyThreat[taille] × difficulté
```

- `baseThreat` 20, `threatPerFloor` 5 (en dixièmes de monstre) ;
- `partyThreat` : 100 / 190 / 280 % pour 1, 2, 3 joueurs ;
- difficulté : Calme 100 %, Agitée 130 %, Cauchemar 165 %.

Le budget est dépensé au hasard parmi les monstres qui laissent le reste
dépensable sur les places restantes (6 au plus). **Un budget trop grand pour 6
places revient en PV** (jusqu'à +150 %). Les monstres gagnent **+4 % de PV par
étage**, et à partir d'un étage ils portent des bonus :

| Étage | Bonus des monstres |
|---|---|
| 8 | Sharpened (+10 % dégâts) |
| 11 | Thick Skin (−1 par coup) |
| 14 | Sharpened |
| 17 | Focus (+1 PA) |
| 20 | Sharpened |
| 23 | Thick Skin |

Niveau du bot : facile jusqu'à l'étage 4, normal de 5 à 14, difficile ensuite.

### 2.3 Les boss

Tous les 5 étages, une seule salle : un des **six maîtres des îles** (Monolithe,
Kraken, Heart of Winter, Eye of the Swarm, Mother Gloop, Ash King), dans le set
de son champion, avec son profil de combat et sur son île. PV : 110 / 200 /
280 % du champion selon la taille du groupe. Il lance son ultime dès le
tour 1 **à partir de l'étage 10**, et amène une escorte de son île à partir de
l'étage 10. Une salle de boss paie un rare et deux légendaires.

### 2.4 Les twists

| Twist | Effet |
|---|---|
| Burning Ground | 6 cases de feu au départ |
| Fog | une bande de fumée au centre |
| Frozen Edge | de la glace sur le bord du plateau |
| Thick Hide | monstres +30 % PV |
| Heavy Limbs | tout le monde −1 PM, +1 PA |
| Short Night | tours de 30 s |
| Open Field | aucun couvert |
| Swarm | +1 monstre faible gratuit |

Une salle Agitée ou Cauchemar en porte un, deux à partir de l'étage 10.

### 2.5 Les bonus

Trois proposés par victoire, selon la rareté que paie la salle. Jamais un bonus
inutile pour le joueur (lore d'un autre grimoire, Wake Up ou Shared Strength
en solo, Twice sur une attaque de base à recharge). Un bonus déjà pris ne
revient que s'il se cumule.

| Rareté | Bonus |
|---|---|
| Commun | Vigor (+10 PV, cumulable), Stride (+1 PM), Thick Skin (−1 par coup, cumulable), Sharpened (+10 % dégâts, cumulable), Long Arm (+1 portée aux sorts de portée ≥ 2), Quick Hands (attaque de base −1 PA), Head Start (+2 PM au premier tour) |
| Rare | Focus (+1 PA), **Wake Up** (sort : relève un allié tombé à 40 % de ses PV, une fois par combat), Shared Strength (+1 PA aux alliés à 2 cases ou moins), Twice (attaque de base une fois de plus par tour), Lore of Embers (Combustion −1 PA), Lore of the Wind (Updraft +2 portée), Lore of the Tide (Bubble Trap −1 PA), Lore of Stone (−1 case de poussée) |
| Légendaire | Second Wind (une fois par run, rester à 1 PV au lieu de tomber), Early Ultimate (ultime dès le tour 1), Dream Shield (tout le groupe commence protégé : −3 par coup jusqu'à la fin de son premier tour), Overflow (jusqu'à 2 PA non dépensés reportés) |

Un bonus qui modifie un sort donne au joueur **son propre sort**, avec un
nouvel id et l'id d'origine (`baseId`) : les aperçus, le bot et les effets
visuels le lisent tel qu'il est.

## 3. Ce qui a changé dans le code

### Moteur (`internal/game`) — [ADR 0004](../adr/0004-teams.md)

- `Player.Team`, `Options.Seats` : un combat se joue entre équipes, se
  termine quand un seul camp tient debout, les équipes jouent en alternance et
  partent chacune d'un bloc commun. Un duel ne change pas, ses
  enregistrements rejouent à l'identique.
- Les morts ne bloquent plus leur case ; le passage de tour ne saute plus le
  combattant suivant quand quelqu'un meurt de ses blessures en début de tour.
- Le bot voit ses alliés : il les contourne, et ne lance jamais un sort qui les
  touche.
- Monstres (`BotSpec.Monster`, `Stats`), bonus (`Seat.Boons`, `BotSpec.Boons`),
  twists (`Options.Twists`) et le sort Wake Up (`revive`, ciblage `fallen`).
  Tout est une entrée du combat, enregistrée dans la `Recording` (champs
  optionnels uniquement).

### Le songe (`internal/dream`)

- `FloorOffer`, `BoonOffer` : tirés de `(graine du run, étage)`, jamais de
  l'horloge — recharger la page redonne les mêmes salles et les mêmes bonus.
- `Run` : groupe, étages, combats, bonus, départs, fin.
- `TestTheClimbGetsHarder` : des bots montent en solo, duo et trio et la CI
  tient la courbe de difficulté.

### Serveur (`internal/websocket`, `internal/store`, `internal/api`)

- Messages `dream_create`, `dream_join`, `dream_resume`, `dream_leave`,
  `dream_start`, `dream_point`, `dream_enter`, `dream_boon` ; réponse
  `dream_state` (la vue du run pour ce joueur, sa clé comprise).
- Chaque étage est une salle privée (non listée, non rejoignable). Fin de
  combat → bonus, ou fin du run ; le groupe est ramené au songe 3 s après.
- Runs sauvegardés dans le store (mémoire, ou Postgres : migration
  `0002_dreams.sql`). Après un redémarrage, chaque membre revient avec sa clé ;
  un combat en cours est perdu et l'étage reprend au choix de la salle.
- Classement écrit par le serveur seul : `GET /api/dreams/leaderboard?size=1|2|3`.
- Absent hors combat : 45 s de grâce, puis sortie du run. Un groupe qui quitte
  tout entier un combat le perd.

### Client

- `/dream` (groupe, salles, bonus, fin) et `/dreams/leaderboard`, avec entrée
  depuis le lobby et l'écran d'accueil téléphone.
- En combat : anneaux et pastilles par camp (les alliés en ambre), anneau
  brisé là où un allié est tombé, monstres dessinés depuis le bestiaire,
  pas de revanche ni d'arc solo, fin de combat propre au songe.

## 4. Écarts avec le premier plan

- **Lucid Dream retiré** : la vie revient déjà au max entre deux combats.
- **Les monstres viennent du bestiaire des îles** (le jeu a gagné des îles et
  un bestiaire depuis le premier plan), et les boss sont les maîtres des îles.
- **Dream Shield** : le bouclier du jeu retire un montant fixe à chaque coup,
  ce n'est pas une réserve de PV ; d'où « −3 par coup jusqu'à la fin du premier
  tour ».
- **Lore of Embers** : Kindle n'est pas un sort du grimoire Pyromancer ; le
  bonus réduit Combustion d'1 PA.
- **Bonus « au choix »** : Long Arm, Quick Hands et Twice s'appliquent à des
  sorts fixés (portée ≥ 2, attaque de base), pour ne pas demander de choisir un
  sort au moment du bonus.
- **Nombres** : réglés par la simulation (boss solo à 110 %, bonus des monstres
  dès l'étage 8, budget converti en PV au-delà de 6 monstres).

## 5. Plus tard

- **Songe de la semaine** : une graine commune à tous, avec son classement.
- **Planches de combat des boss**, au lieu de celles de leur champion.
- **IA par palier** : soigneurs, protecteurs.
- Rejoindre un run en cours entre deux étages.
