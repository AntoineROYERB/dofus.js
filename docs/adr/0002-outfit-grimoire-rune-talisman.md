# 2. Your character wears an outfit, and carries a grimoire, a rune and a talisman

- Status: proposed
- Date: 2026-09-25

## Context

A fighter today is a class from `config/classes.json`: an element, a passive,
a palette, a few stat overrides and a bar of five spells, one of which is an
ultimate. There are four, every Pyromancer is the same Pyromancer, and nothing
a player earns changes their fighter.

The game is built for 5 to 10 minute sessions on a phone, for a wide audience
([#87](https://github.com/AntoineROYERB/dofus.js/issues/87)). Play starts from
a home screen where the player picks a **portal**: a short run of rooms, then
a boss ([ADR 3](0003-runs-from-the-home-screen.md)). Bosses need something
worth dropping.

We want four things that pull against each other:

1. **A character that is yours.** Some role-play: one character you dress,
   who shows what you have beaten, and whose look you can change as often as
   you like.
2. **A game a newcomer understands in a minute.** Every extra system on a
   phone screen loses players. The reference is Brawl Stars: a strong kit,
   read at a glance, with only a little to choose around it.
3. **Fair 1v1 PvP.** Loot must widen choices, never raise power, and
   whatever a map favours must be a choice both players can make.
4. **Updates that add, never rework**, with the rules kept in JSON validated
   at startup.

## Decision

The player has **one character**: a name, a colour, and everything they have
collected. In a fight, that character wears **an outfit** and carries **a
grimoire**, **a rune** and **a talisman**. Each of the four does one thing:

| Item | Gives | Rule |
|---|---|---|
| **Outfit** | The element, the look, and **the basic attack** (the weapon drawn in it) | At least one per element; many more as pure looks |
| **Grimoire** | **Three spells and the kit's passive** | Same element as the outfit |
| **Rune** | **One global improvement**, never elemental | Goes with any outfit |
| **Talisman** | **The ultimate** | Goes with any outfit |

1 + 3 + 1 is the five-spell bar the game already has, plus a passive and a
rune. Beside these sit the other looks (pets, cosmetic auras, wings, titles,
trophies), which never touch a fight.

Each item answers one question: the outfit says **who you look like**, the
grimoire **what you do**, the rune **how you like to play**, and the talisman
**how you finish**.

### Outfits

An outfit is a full sprite sheet, weapon included, drawn in one element.

- **It gives the element.** Everything else must match it: the grimoire
  always, and any outfit of an element works with every grimoire of that
  element. The silhouette's family therefore tells the opponent the element.
- **It gives the basic attack**, because the weapon is drawn in it: a trident
  thrusts, a flail swings. Each element has a small set of basic attacks
  (a melee one and a ranged one to start with), and an outfit points to one of
  them. A new outfit is art and a pointer, never a new number to balance.
- **Everything else about it is looks.** An outfit carries no stats and no
  effect, so outfits can ship in any number: seasonal ones, boss-themed ones,
  rare variants. This is where the role-play lives.

**Basic attacks are unlocked in the portals.** A champion's outfit brings the
first basic attack of its element. After that, each portal has one room whose
first clear gives an outfit of the island's element carrying another basic
attack. Every basic attack is therefore earned by playing, and no sold outfit
gives access to a move others cannot get: a sold outfit always points to a
basic attack that can be unlocked in a portal.

**The first outfits** are the four champions', plus two per element that carry
the armour grimoire's weapon attacks: a melee one (Lantern Blow, Lance Thrust,
Trident Strike, Sweep: 3 AP, next to you, 8 damage) and a ranged one
(Fireball, Steel Feathers, Water Orb, Stone Throw: 3 AP, up to 5 cells,
5 damage). They draw the champions' sheets. Until the portals exist, all of
them are open to everyone, so everything can be tried.

**The player's colour tints the accents only**: the eyes and the trims. The
outfit's own colours, which tell its element, never change.

### Grimoires

A grimoire is the kit: **three spells and a passive**, of one element, plus the
kit's stat adjustments (today's `health` and `movementPoints` overrides live
here, not on the outfit). It is what a class was, minus its basic attack and
its ultimate.

The passive belongs to the grimoire because it only makes sense with its
spells: stacking burns need spells that burn, the relay needs the spell that
places it. Today's passives are the first four grimoires' passives.

A new grimoire is the big content of an update: new spells, one passive, and
it works at once with every outfit of its element. **A second grimoire for an
element ships with a new champion and their full set** (outfit, grimoire,
rune, talisman): the update's event is a new champion to beat.

### Runes

A rune is **one sentence** that improves the character in a way that has
nothing to do with an element. It goes with any outfit and any grimoire, and
the player picks it for **how they like to play**, not for their element.

A rune only touches what every fighter has: health, AP, MP, range, shields,
pushes, terrains, placement, the ultimate's charge. It never names an element,
a status or a spell.

| Style | Rune | Effect |
|---|---|---|
| Tempo | Momentum | +2 MP on the first turn |
| | Patience | Ending a turn without moving gives +1 AP next turn |
| Survival | Second skin | The fight starts with a shield that soaks 3 damage from every hit until your first turn is over |
| | Last breath | The first time you drop below 25% health, +2 MP that turn |
| Aggression | Opportunist | +20% damage against a target below 30% health |
| | Duellist | +15% damage when no other enemy is within 3 cells of your target |
| Placement | Anchor | Pushes carry you 2 cells less |
| | Rebound | When you are pushed, +1 MP on your next turn |
| Ultimate | Fervour | Your talisman charges faster when you take damage |
| | Reserve | Your ultimate costs 1 AP less, but charges more slowly |
| Terrain (bosses) | Heart of Winter | You do not slide on ice |
| | Mother Gloop | You are immune to acid |
| | Monolithe | +1 range with your back to a rock |

The terrain masteries of the design doc are the bosses' runes. In PvP they are
picked after the map is shown, which is what makes them a decision.

**At launch there are four general runes**, the ones in the champions' sets:
Opportunist, Momentum, Second skin and Anchor.

Which champion carries which rune, and how strong each is, came out of the
bot matrix rather than a guess. Giving Mother Brine the shield made her win
three matchups out of four by more than the 65% ceiling; with the shield on
Sef (3 per hit, for one turn), Momentum on Mother Brine (+2 MP) and
Opportunist on Ashka (+20% below 30% health), every matchup sits between 40%
and 60%, as the classes did before runes. The others in the table are for
later updates. The bosses' terrain runes come with their portals.

A universal rune can be harmless on one kit and overwhelming on another. Three
rules guard against it:

- **Every rune has a condition or a trade-off**, never a plain permanent bonus.
- **No rune gives raw range or raw damage without a condition.**
- **Every rune is tested with every grimoire** by bot-against-bot runs (see
  Balance).

### Talismans

A talisman **carries the ultimate**. It orbits the character:

- **When the ultimate is cast, the talisman casts it**: Ashka's heart rises into
  the sky and falls on the enemies as Meteor.
- **It is the ultimate's gauge**: dull while the ultimate is not ready, glowing
  and turning faster when it is. The opponent sees the ultimate coming, like
  the super in Brawl Stars.
- **It is a trophy**: it shows what you have beaten.

An ultimate has its own fixed element and never names a grimoire's spell, so
any talisman goes with any outfit. A talisman is exactly one ultimate, nothing
more, so a boss's talisman is another choice, never a stronger one.

**The legendaries' talismans are infused.** The four legendaries of the
bestiary each drop a talisman whose ultimate keeps its shape, its cost and its
damage in every hand, and takes on **the element of the outfit it is cast in**:
the element adds one thing, drawn from its grimoires' language (burns, the
pylon and pushes, ice, water and holds, rocks and lost movement). The
legendary itself steps onto the board and plays its own attack.

| Legendary | Ultimate | Core | Fire | Air | Water | Earth |
|---|---|---|---|---|---|---|
| The Ashen King | King's Cleaver | 16 on a line of 3 | Fire for good, 2 burns | Thrown 2 back, the blade stays as your pylon | Thrown 2 back, ice for good | A menhir each side, −2 MP |
| Aurorion | Three-Headed Ray | Three rays of 6, anywhere within 8 | A burn per ray | Each ray throws 1 back | A cross of ice, held a turn | A cage of rocks for 2 turns |
| Fulgor | Thunder Drums | 8 now, 8 and 14 at your next two turns | A burn per beat, the last sets them off | The beats follow their target, 6/6/10 | A cross of water, lightning hits 50% harder | −1 MP a beat, the last splits the ground |
| Sahr'Khan | Maw of the Deep | Come out within 6: 14 around you, thrown 2 away | Fire around you, a burn | Smoke around you for 2 turns | Water around you, held a turn | A shield of 10 until your next turn |

The champions' own ultimates keep their fixed element. An infusion only ever
adds one effect to the same core, so the matrix of what can be balanced grows
by riders, not by new spells.

The six bosses' ultimates, a first proposal. Each uses its island's element and
terrain, and is built from what the engine already has (pushes, pulls, root,
MP loss, burns, terrain, pillars). Numbers are placeholders, to be tuned
against the champions' four:

| Boss | Talisman | Ultimate |
|---|---|---|
| Monolithe (earth) | Monolithe's shard | **Rockfall**: rocks rise on the four cells around a target, 14 damage to it; it is walled in until it breaks out or they crumble after 2 turns |
| Kraken (water) | Kraken's eye | **Grip of the deep**: every enemy within 4 cells is pulled 2 cells towards you, takes 10 damage, and the cells they cross turn to shallow water |
| Heart of Winter (water) | The frozen heart | **Endless winter**: a wide cross of ice for good, 12 damage, and every enemy inside is held in place for a turn |
| Eye of the Swarm (air) | The storm eye | **Eye of the cyclone**: you move to any free cell within 8, then every enemy next to you is thrown 3 cells away, 10 damage each |
| Mother Gloop (earth) | Gloop's pearl | **Acid tide**: a wide area of acid puddles for 3 turns; enemies ending a turn in it lose 1 MP on top of the acid's damage |
| Ash King (fire, legend) | The ash crown | **Crown of ash**: the ring of cells around you turns to lava for 2 turns, and every enemy next to it takes 2 burns |

### Champions and their sets

Today's four classes become four champions, each with a **full set**: an
outfit, a grimoire, a rune and a talisman. Their solo opponents are the
champions, lines included. No spell is redesigned:

| Champion | Outfit (basic attack) | Grimoire (3 spells + passive) | Rune | Talisman (ultimate) |
|---|---|---|---|---|
| Ashka the Kindled | Ashka's (Kindle) | Scorched Earth, Combustion, Smokescreen + Embers | Opportunist | Ashka's heart (Meteor) |
| Sef of the Long Grass | Sef's (Lightning) | Updraft, Gale, Tailwind + Relay | Second skin | Sef's feather (Tempest) |
| Mother Brine | Mother Brine's (Hydro Cannon) | Bubble Trap, Downpour, Frozen Ground + Tide | Momentum | Mother Brine's conch (Maelstrom) |
| Old Grund | Old Grund's (Hammer) | Earthleap, Stone Grapple, Pillar + Rock | Anchor | Old Grund's stone (Earthquake) |

Embers, Relay and Tide are today's passives. Rock is the Stonewarden's
+50% up close; its push resistance becomes the Anchor rune, so Old Grund's set
plays exactly like today's Stonewarden.

**A set is equipped in one tap.** A newcomer never has to assemble anything:
they pick a set, and only mix items when they want to.

### Mastery: long play shows, and changes nothing

A player who has played a lot should look like it, without it touching a
fight. Every grimoire, talisman and outfit gains **mastery** by being played,
and the character gains **renown** from everything they do. Each shows where
the item already shows:

| Mastered | Where it shows | From novice to master |
|---|---|---|
| **Grimoire** | The glyph on the ground | A plain circle → more rings and carved runes → a golden, animated circle |
| **Talisman** | The object in orbit | A bare orbit → a trail of light → a golden trail with particles |
| **Outfit** | The outfit itself | New → embroidered trims → gilded finishes |
| **Character** (renown) | The nameplate and the home screen's stand | Wood → stone → marble → gold, and a frame round the name |

- **Five tiers per item**: Novice, Initiate, Adept, Expert, Master. They rise
  with fights played and won, in portals and in PvP.
- **A title at Master**: "Master of Embers", "Master of the Tide"…
- **An optional seasonal mark**: a high PvP rank, or a high place on the
  portal of the day, gives a mark for the next season (a silver flame round
  the name), so recent form shows, not only seniority.

Two rules keep it honest:

- **Mastery never changes the shape of a signal.** The glyph keeps its
  grimoire's shape and only gains ornament; the talisman's "ultimate ready"
  glow is untouched, and mastery shows on the orbit's trail instead.
- **Mastery is never sold**: no tier, no booster. The shop may sell outfits,
  never their mastery finishes. Otherwise it would prove nothing.

### The first launch

1. **Creation.** A name, a colour, and **a type**: fire, water, earth or air.
   Picking a type shows the character in the novice outfit of that type (the
   base skin **holding that type's weapon, with its aura**); a tap plays the
   weapon's attack. The weapon and the aura are what a type looks like; there
   is no sheet to read.
2. **Tutorial.** The guided tutorial, with the novice outfit and a novice
   grimoire of that type (two simple spells), no rune and no talisman, so no
   ultimate yet.
3. **The trial.** The player fights **the champion of their type**, in its full
   set.
4. **The reward.** Beating the champion gives its full set. The player walks
   away with a complete fighter, ultimate included, and already knows the kit
   from the receiving end.
5. **The first portal** opens: the Prairie.

The three other champions stay on the home screen, to be beaten later for
their sets. Every future grimoire can arrive the same way, with a new champion.

### Loot

| Source | Drops |
|---|---|
| The trial, and each champion | Its full set |
| A room of a run | Looks and shards; one room per portal gives an outfit with a new basic attack |
| A portal's boss | Its talisman (a new ultimate) and its rune (a terrain mastery), guaranteed on the first win; an outfit of its island's element; looks after |
| The legend (Roi Cendre) | Rare talismans, wings, trophies |
| Duplicates | Shards, which buy the looks you are missing |
| Shop and pass | Outfits and looks only |

Bosses fight with their own talisman and rune, so the player meets them before
owning them.

### Reading the fight

- **The outfit's family and colour → the element.**
- **The glyph on the ground under the character → the grimoire.** Each grimoire
  has its own circle, drawn from the element's `sigil` effect in
  `animation/fx/`.
- **The orbiting object → the talisman**, so which ultimate, and its glow →
  ultimate ready.
- **The rune → an icon on the health bar.** The first time it fires in a fight,
  its sentence shows in full.
- **Tapping a fighter** shows its four items, one line each.

### PvP

- Nothing has levels. What loot changes is which grimoires, runes and
  talismans you can field.
- **Maps act through terrains only**, which apply to both players alike. No
  map gives a bonus to an element.
- **The map is shown first; then both players pick their set at the same time,
  blind.** Terrain runes become a decision about the map, open to both.

### Balance

There is no point budget: numbers are tuned by hand. Outfits carry no numbers
of their own, so the matrix is **grimoires × runes × talismans**, and it is
measured rather than guessed:

- **Bot-against-bot runs** over every combination on each content change.
  Matches are deterministic and the bot plays through the public API
  ([ADR 1](0001-event-sourced-matches.md)), so this is a test job, not a
  project.
- **Pick rate and win rate** per grimoire, rune and talisman on the Grafana
  dashboard.

### Content files

- `config/outfits.json`: name, element, basic attack (a spell id of that
  element), the weapon's name, a palette, sprite.
- `config/grimoires.json`: name, element, three spell ids, passive, stat
  adjustments, ground glyph.
- `config/runes.json`: name, one effect from a closed vocabulary, source.
- `config/talismans.json`: name, one ultimate spell id, source, sprite.
- `config/champions.json`: name, lines, and the four items of their set.
- `config/cosmetics.json`: kind, name, sprite. No field a fight could read.
- `config/mastery.json`: the tier thresholds and titles. Each player's progress
  is not config: it lives with their account on the server.
- `config/classes.json` is split into the above and removed.

The validator refuses, at startup:

- a grimoire whose element has no outfit, or an outfit whose basic attack is
  not of its element;
- a rune whose effect names an element, a status or a spell;
- a talisman whose spell is not an ultimate, or a grimoire spell that is;
- a champion whose set mixes elements between outfit and grimoire;
- a cosmetic carrying anything a fight could read.

## What an update costs

| Adding | Work |
|---|---|
| An **outfit** | Art, and a pointer to one of its element's basic attacks |
| A **grimoire** | 3 spells, a passive, stat adjustments, a ground glyph, `fx/` |
| A **rune** | One sentence from the vocabulary |
| A **talisman** | One ultimate, its `fx/`, one orbiting sprite |
| A **champion** | Lines, and a set of the above |
| A **portal** | A data recipe (ADR 3), its boss's talisman and rune |
| An **element** | At least one outfit and one grimoire, its basic attacks, palette and `fx/` |
| A **look** | Art only |

Nothing already shipped is touched by any of these.

## Consequences

- **The engine barely moves.** A seat takes four item ids. The loader
  assembles the bar (outfit's basic attack, grimoire's three spells,
  talisman's ultimate), the grimoire's passive and stats, and the rune's
  effect. What reaches `internal/game` is the same kind of spell list and
  numbers it handles today, plus runes, which need hooks for their small
  vocabulary.
- **Replay.** The command that seats a player carries the four item ids, and
  the outfits, grimoires, runes and talismans files join the `Rules`
  fingerprint. Changing any of them invalidates recordings, as changing a
  spell does today.
- **Classes leave the code.** `types.Class` and `classes.json` go; the class
  picker (`ClassPicker`, `ClassCarousel`) becomes the wardrobe and the set
  picker. Class-specific passive code becomes the grimoires' passives.
- **Ultimates leave the bars.** Meteor, Tempest, Maelstrom and Earthquake move
  to the champions' talismans, and any outfit can carry any of them.
- **Art.** Today's `animation/outfits/` sheets are the four champions' outfits.
  New: four novice outfits (the base skin with a weapon layer) and four auras
  for the creation screen, a ground glyph per grimoire, an orbiting sprite per
  talisman, and a new outfit per boss.
- **Mastery needs accounts.** Per-item progress and renown are stored on the
  server with the accounts of #42, counted from finished matches, so a client
  cannot claim them. Its art is part of each item's: ornament tiers for every
  glyph, trails for every talisman, trims for every outfit, five stands.
- **ADR 3 must follow.** It still describes bosses dropping an outfit and a
  relic, rooms dropping weapons, and ice and acid as elements.

## Alternatives considered

- **Fixed classes, nothing to earn** (today). Clear, but bosses have nothing to
  give and players nothing to make their own.
- **Five armour pieces with set bonuses at 2, 3 and 5.** Deep, but five slots
  and their tiers are a lot to read on a small fighter, and a lot to learn.
- **An armour as one element, one terrain mastery and a 100-point budget**
  (the first version of #79). Its masteries live on as the bosses' runes; the
  budget is dropped for hand tuning.
- **An outfit (3 spells), a weapon (the element) and a relic (the ultimate),
  with element resonance.** Hybrids across elements and a contract every
  element must fill: a theorycrafting game, not a pick-up-and-play one.
- **Heroes, like brawlers, with a trait and a talisman.** Simple and readable,
  but the player plays other people's characters, not their own, and every
  look is tied to one kit. Its talisman is kept as is.
- **Runes tied to an element.** Would have held today's passives, but a rune
  that only fits one element is part of the kit, so the passives went to the
  grimoire and runes became the one thing that travels everywhere.
- **One rune per spell** (building a bar spell by spell). A deckbuilder: every
  spell balanced against every other, and a newcomer does not know what to
  pick.

## Open questions

- **Are the six boss ultimates the right ones?** The table is a first
  proposal; each needs a play test against the champions' four.
- **Which room of a portal unlocks its basic attack**: the first, or one
  marked on the portal?
- **Do the boss runes count among the four launch runes**, or come on top of
  them? This ADR assumes on top.
- **A personal aura in the player's colour?** As a look it would be welcome,
  but it must not be mistaken for the element's aura on the creation screen.

## Out of scope

The portals and runs themselves (ADR 3), drop rates and shard costs, the
wardrobe and shop screens.
