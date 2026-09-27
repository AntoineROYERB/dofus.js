# Art direction

This is the visual charter of Dofus.js. It is written for the people who work
on the game and for the language models that help them: before drawing,
styling or animating anything, read the section that covers it, and follow it
unless the change you are making is to this document.

Where the code and this document disagree, the code is what ships and this
document is what was meant. Fix whichever is wrong, and say which in the
commit. A rule changes by editing this file in the same pull request as the
code that needs the change.

Section 11 lists the open questions this version of the charter leaves to
decide.

---

## 1. The idea in one sentence

**A pixel-art world, framed by ink on paper.**

The game has two layers, and every visual decision starts by asking which one
it belongs to:

| Layer | What is in it | How it looks |
| --- | --- | --- |
| **The world** | The board, the open world, fighters, monsters, terrain, spell effects | Pixel art, drawn with one brush (section 5) |
| **The frame** | HUD, menus, cards, tooltips, the combat log, the lobby, the wardrobe | Paper, ink, graphite and one vermilion — the "Composée" palette (section 3) |

The two never borrow from each other. The frame has no pixel fonts, no
outlines and no dithering. The world has no hairlines, no rounded corners and
no UI type.

Three principles run through both layers:

1. **Colour is information.** A saturated colour always means something the
   player has to act on or avoid. Decoration is paler than anything that
   matters.
2. **Readable at a glance on a phone held sideways.** Everything is checked
   at 2× pixel scale on a 740×360 screen, where the board is about eight
   cells across.
3. **Movement answers a question.** An animation plays while something is
   happening or waiting on the player, and stops the moment the question is
   answered (section 8).

---

## 2. Tone

- **Dofus, not Dark Souls — except in the lairs.** The starting islands are
  bright, round and friendly. Darkness and menace are kept for boss lairs and
  night, so that they mean something when they come.
- **Armour is dark metal with an elemental glow.** Every outfit reads as a
  silhouette first, and its element shows as light: embers for fire, cyan
  for water, green for earth, pale sky for air.
- **The world is handmade.** It uses hard pixel edges, coloured shadows and
  short palettes, and never uses smooth gradients, soft glows or blur.

---

## 3. The frame: Composée

The tokens live in `frontend/tailwind.config.js` and `frontend/src/constants.ts`.
Use the token name, never the hex value, in components.

### 3.1 Colours

| Token | Hex | Meaning — and the only thing it may mean |
| --- | --- | --- |
| `paper` | $\color{#f2f2f0}\blacksquare$ #f2f2f0 | The page behind every screen |
| `panel` | $\color{#fbfbfa}\blacksquare$ #fbfbfa | Cards and sheets laid on the page |
| `board` / `board-alt` | $\color{#ffffff}\blacksquare$ #ffffff / $\color{#f4f4f2}\blacksquare$ #f4f4f2 | Board cells, alternating |
| `ink` | $\color{#17181a}\blacksquare$ #17181a | Text, 2 px frames, the primary button's text |
| `graphite` | $\color{#5f6260}\blacksquare$ #5f6260 | Secondary text |
| `muted` | $\color{#8b8d8a}\blacksquare$ #8b8d8a | Labels, disabled, knocked out |
| `rule` / `hairline` | $\color{#cfd0cd}\blacksquare$ #cfd0cd / $\color{#e2e3e0}\blacksquare$ #e2e3e0 | Dividers and cell strokes |
| `vermilion` | $\color{#d1462f}\blacksquare$ #d1462f | **What your action is about to hit, and the one call to action on a screen.** Nothing else. |
| `pa` | $\color{#2f6fd1}\blacksquare$ #2f6fd1 | Action points, wherever they are shown or changed |
| `pm` | $\color{#2f9e44}\blacksquare$ #2f9e44 | Movement points, where you can walk, where you may start |
| `amber` / `amber-wash` | $\color{#b5790a}\blacksquare$ #b5790a / $\color{#f7ecd6}\blacksquare$ #f7ecd6 | Your own turn, your own fighter's highlight, and the ring under your fighter |
| `foe` (BOARD) | $\color{#a3231b}\blacksquare$ #a3231b | What is the other side's: where they may start, and the ring under their fighters. A cell to keep off, never a target |

**A player does not pick a colour.** Whose fighter is whose is told by side,
not by player: the ring under your fighter and your dot in the turn order are
`amber` (`BOARD.socle.mine`), and the other side's are `foe` red
(`BOARD.socle.theirs`). Two fighters in the same outfit therefore never share
a ring. Nothing tints a fighter's sprite: an outfit keeps its own trims.

**Elements have one colour and one icon each**, and they show wherever an
element does: spells, grimoires, sets, the wardrobe, the drums and wards they
leave on the board. The colours come from the grimoires' own sigils, and are
kept clear of vermilion and of the `pa` blue and `pm` green, so a number over
a fighter never reads as both damage and a stat. They are defined in
`frontend/src/utils/elements.ts` (with each element's pixel icon: a flame, a
gust, a drop, a stone) and, for the spells the server paints,
`backend/config/spells.json` ("elements"); keep the two in step.

| Element | Hex | Its sigil |
| --- | --- | --- |
| Fire | $\color{#e0791a}\blacksquare$ #e0791a | Ember |
| Air | $\color{#4fa3c7}\blacksquare$ #4fa3c7 | Sky |
| Water | $\color{#1f8a8a}\blacksquare$ #1f8a8a | Lagoon |
| Earth | $\color{#a8702a}\blacksquare$ #a8702a | Ochre |

A rune belongs to no element: its sign is lit in a violet
($\color{#a88cf0}\blacksquare$ #a88cf0) that no element uses.

### 3.2 Type

| Role | Family | Use |
| --- | --- | --- |
| Display | **Archivo**, bold, tight tracking | Names, titles, the numbers that matter (HP, timer) |
| Body | **Public Sans** | Sentences: rules, lore, tooltips |
| Label | **Azeret Mono**, uppercase, `tracking-label` (0.18em), 9–11 px | Every small label, counter and tag |

Numbers that change during play use tabular figures (`tabular-nums`).

### 3.3 Shapes

- **Square corners.** A frame is a 2 px `ink` border or a 1 px `hairline`.
  Only dots, pips and badges are round (`rounded-full`).
- **No shadows except to lift something off the board**, such as a tooltip or
  a sheet (`shadow-md` at most).
- **One vermilion element per screen state.** If two things want to be
  vermilion, one of them is wrong.

### 3.4 Writing

In-game text is English, short, and concrete:

- A rule is **one sentence with its number in it**: "Costs 2 MP to enter;
  whoever stands in it takes 10% more water damage." Never "reduces
  mobility".
- Say what happens to the player, in the second person or with "whoever".
- A label is a noun (`WARDROBE`, `FIGHT ON`), and a button is a verb
  (`Challenge`, `End turn`).
- Copy that assumes a mouse ("hover", "press 1") has a touch variant
  ("tap"), selected with the `touch:` screen.

---

## 4. The board in a fight

The board is part of the world, but it has to be read like a diagram. Until
section 11.1 is decided, it stays in the Composée style: pale cells with thin
strokes, grey blocks for cover, and **only two inks during a turn** — green
(`pm`) for where you can walk and vermilion for what your click will hit.

- "Too far" and "cannot see it" are different answers. The second one is the
  `blind` wash: vermilion faded almost to grey.
- A knocked-out fighter's ring turns into a broken line. The state is never
  shown by colour alone.
- Island ground (section 6.5) is drawn **under** everything else and quieter
  than it: a wash and a few marks per cell. Solid ground (rock) stands up off
  the board like cover. Flat ground stays flat.
- The island's terrains are always listed in the board's top-left corner,
  with the same sentence the cell's card shows.

---

## 5. The world: one brush

Everything that lives in the world is drawn to the same pixel grid, so
monsters, heroes, trees and walls look like they were painted by the same
hand.

### 5.1 The grid

- **A cell is 64 art pixels wide and 32 deep** (`ART_TILE = 64`). A terrace
  step rises 0.6 of a cell (`LEVEL_RISE`).
- The world is painted into a canvas **at art resolution**, then scaled up by
  a **whole number** (×2 on a phone, ×3 on a large screen) with no smoothing
  (`image-rendering: pixelated`). There is never a fractional zoom.
- The camera and everything drawn on the canvas land on whole art pixels.
  Anything seeded with noise (ripples, sparks) is seeded from its position in
  the world, never from its position on screen.

### 5.2 Line and light

- **Everything that stands has a 1 px dark outline**: fighters, monsters,
  trees, rocks, pillars. **The ground does not.** That is how the eye tells
  what blocks from what is only a floor.
- **Light comes from the upper left.** The lit faces are on the left and top,
  shadow faces on the right.
- **Shadows are a darker colour of the same palette**, never black and never
  transparent grey.

### 5.3 Palettes

- An ambience is **about twenty colours** and every pixel is snapped to one
  of them. A blend that survives the snapping is a bug.
- Each island has a palette in `backend/config/islands.json` (ground, stone,
  wood, leaves, pine, grass, flowers, earth, liquid, outline, accent). A new
  island reuses a palette or adds one there, never in code.
- **Starting islands are paler than their creatures**, so the creatures stand
  out. **Boss lairs invert this**: the ground darkens and the boss lights up.
- Day, dusk and night are derived from the day palette. A liquid that glows
  (lava, acid) keeps its colour at night.

---

## 6. Sprites

All sheets are PNGs drawn on the same grid: **art pixels in blocks of 4** on
256-pixel frames, which is 64 art pixels, the width of a cell.

### 6.1 Heroes and outfits

| Sheet | Frame | Frames | Row order |
| --- | --- | --- | --- |
| `Idle` | 256 × 256 | 23 | NW, W, SW, S, SE, E, NE, N |
| `Walk` | 256 × 256 | 7 | NW, W, SW, S, SE, E, NE, N |
| `AttackMelee`, `AttackRanged` | 384 × 384 | 6 | **N**, NW, W, SW, S, SE, E, NE |

- The feet sit at **0.70** of the frame height and the top of the head at
  **0.281** (`SPRITE` in `constants.ts`). Anything hung over a fighter, such as
  a health bar or a burn marker, hangs from the head, never from the frame.
- **One sheet per element**, in `public/animation/outfits/<element>/`:

  | Sheet | Element | Weapon |
  | --- | --- | --- |
  | The Heart-Bearer | fire | a caged-heart lantern on a pole |
  | The Winged Knight | air | a pennant lance |
  | The Drowned Queen | water | a trident |
  | The Rock | earth | a spiked flail |

  Each element has **three outfits** (`outfits.json`): its champion's and two
  more. They share the element's sheet for now (section 11.5) and differ by
  their attack, which is the outfit's basic attack: each of the three fights
  a different way. A new sheet is a complete set of the four sheets on this
  grid, and nothing else: the animation code reads it unchanged.
- **Outfits are never recoloured.** Whose fighter is whose shows on the ring
  and in the turn order (section 3.1), never on the armour. The bare hero
  sheet is the only sprite ever dyed, and only for a fighter with no outfit.
- **What a fighter takes into a fight is chosen in the wardrobe**, a slot at
  a time: the element first (its grimoire, three spells and the rule they
  share), an outfit of that element, a rune and a talisman. The wardrobe
  belongs to the frame. The outfit shelf only shows the element's own
  outfits, and under each one its attack: a strip of cells from the fighter
  to what it hits, in the element's colour, and the few facts that set it
  apart. Trying one on plays it on the stand.
- The melee attack swings the weapon, and the ranged attack throws something
  of the element. Which spell plays which is listed in the effects manifest
  (section 7).

### 6.2 Talismans and runes

Talismans and runes are drawn in code (`frontend/src/vfx/relics.ts`), on the
fighters' own grid: one pixel of theirs is a 64th of a cell, so a talisman
circling a fighter is drawn at the same pixel size as the fighter.

- **A talisman is a shard of whoever it came from**, in colours taken from
  that sprite: Ashka's heart, Sef's feather, Mother Brine's conch, Old
  Grund's stone, and a piece of each legendary (the Ashen King's halo, a
  crystal of Aurorion's wing, one of Fulgor's orbs, Sahr'Khan's coil).
- It circles its fighter as the gauge of the ultimate it carries: grey and
  still while charging; a dithered halo and its element stirring round it
  (embers, wind, bubbles, dust) once ready; gone once cast.
- **A rune is a carved stone**, its shape and sign its own (a cut, a
  pebble's run, a shield, an anchor), the sign lit in the runes' violet.

### 6.3 The bestiary

- `public/bestiary/<name>.png`: **24 frames × 8 directions**. A monster is 64
  art pixels, a boss 128 and a legend 160, and the feet sit at **0.78** of the
  frame.
- A lineage is a name and its variants (`gloop`, `gloop_2`, `gloop_3`), which
  are recolours of the same shapes. Every sheet belongs to an island's lineage
  or boss in `islands.json`.

### 6.4 What a new sprite must pass

1. It sits on the 4-pixel block grid at 256 per 64 art pixels. The one
   exception is the bestiary, which is drawn at art size.
2. It has a 1 px outline in its island's outline colour, or it gets one at
   render time.
3. It reads as a silhouette at ×2 on a phone, and its element is recognisable
   from its light alone.
4. Its feet land on the documented anchor in every direction.

### 6.5 Terrain in a fight

Each terrain of the library needs:
- a **wash** that tells it apart from the other six at a glance;
- **marks** that say what it does (tufts for grass, ripples for water, a
  wind arrow along the current, bubbles for acid, cracks of light for lava);
- **one sentence** in `islands.json`.

Solid terrains are drawn standing and outlined. The others are drawn flat,
without an outline.

---

## 7. Spell effects

Effects live in `public/animation/fx/<element>/`, described by `manifest.json`:
frame size, frame count, loop or one-shot, **layer** and **anchor**.

- **Layers:** `ground` is drawn under fighters (sigils, burning ground,
  fissures), `standing` among them in depth order (firewall, smoke), and `air`
  over everything (projectiles, impacts, meteor).
- **Anchor:** the pixel that lands on the centre of the target cell. For a
  ground-level effect it is at about 0.72 of a 256 frame, like a fighter's
  feet. Projectiles are anchored at their middle and have 8 directions.
- **Size speaks for weight.** Basic attacks are small and in one colour.
  Spells start from a sigil on the ground and have their own larger effects.
  An ultimate may break the cell grid (384–512 px frames), and nothing else
  may.
- Effects use the same 4-pixel grid and the element's own palette. The only
  vermilion in a fight is the targeting mark, never an effect.

---

## 8. Motion

- **Breathe, don't blink.** Things that are waiting on the player (an empty
  name field, a starting cell to pick, the button to press) pulse slowly, and
  stop as soon as they are answered.
- **World time** runs at 12 fps for sprites and effects and 10 fps for
  walking. Wind, water and glow keep moving at 30 fps while nothing else
  does.
- **Reduced motion is a known trade-off.** The pulses in the frame stop
  under `prefers-reduced-motion` (guarded in `index.css`), but the fight
  deliberately ignores it (`utils/motion.ts`). The damped paths froze terrain
  and dropped effects until the board could not be read. Do not add a new
  reduced-motion path to the fight without fixing that first, and do not
  remove the frame's guard.
- **Only the board shakes**, and only when something is hit. The panels and
  the log around it stay still. Shakes and flashes are short, and never used
  for anything that did not hurt.

---

## 9. Accessibility

- **Never colour alone.** Every state that colour carries is also carried by
  a shape, a line style or a word (a broken ring when knocked out, a faded
  wash for "cannot see").
- Body text on `paper` is `ink` or `graphite`. `muted` is only for labels and
  disabled text.
- Touch targets are at least 36 px, and the board confirms a tap before it
  acts (`touchConfirm.ts`).

---

## 10. Checklist before a visual change ships

- [ ] Is it the world or the frame? It uses only that layer's tools.
- [ ] Every colour is a token, and every saturated colour means something the
      player acts on.
- [ ] At most one vermilion thing on screen in this state.
- [ ] World art is on whole art pixels, snapped to its palette, and outlined
      if it stands.
- [ ] Sprites follow the sheet table: frame size, row order, anchor.
- [ ] Readable at ×2 on a 740×360 phone held sideways.
- [ ] Works with a finger instead of a mouse; the frame's pulses respect
      reduced motion.
- [ ] Checked in the browser, in the state where it matters: a fight, night,
      a boss lair.

---

## 11. Open questions (decisions to make)

These are the places where the game and this charter do not agree yet. Each
one needs a decision before it is fixed.

1. **The fight board is still vector.** The open world moved to pixel art
   ("one brush"), and the fight board did not: its cells, cover and island
   ground are drawn as flat vector shapes. The proposal is to move the board's
   **ground and cover** to pixel art on the same 64 px grid, and keep the
   **marks** (range, path, target) crisp vector ink on top, since they are
   the frame reaching into the world.
2. ~~**Two elements share the stat colours.**~~ **Decided:** the elements
   have colours of their own, taken from the grimoires' sigils rather than
   the outfits' glows, and clear of `pa` and `pm` (section 3.1).
3. ~~**Mirror matches.**~~ **Decided:** rings are coloured by side, `amber`
   for yours and `foe` red for theirs, so two fighters in the same outfit
   never share a ring (section 3.1).
4. ~~**The effects are drawn but not wired.**~~ **Decided:** a spell plays
   the grimoire's sheets, and what it leaves on the board is drawn with them;
   the procedural effects stay only as the fallback for a spell with no
   sheet.
5. **Outfits of one element look alike.** The three outfits of an element
   share its sheet, so they differ in a fight only by the attack they play.
   Telling them apart on the board needs a sheet each on the same grid, which
   is an art job.
