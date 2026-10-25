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

**A pixel-art world, framed by a storybook night.**

The game has two layers, and every visual decision starts by asking which one
it belongs to:

| Layer | What is in it | How it looks |
| --- | --- | --- |
| **The world** | The board, the open world, fighters, monsters, terrain, spell effects | Pixel art, drawn with one brush (section 5) |
| **The frame** | HUD, menus, cards, tooltips, the combat log, the lobby, the wardrobe | Night blue, starlight and gold — the "Heart grimoire" palette (section 3) |

The two never borrow from each other. The frame has no pixel fonts, no
outlines and no dithering. The world has no hairlines, no rounded corners and
no UI type. The fight board sits between the two (section 4): world ground,
drawn in the frame's night.

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

## 3. The frame: Heart grimoire

The tokens live in `frontend/src/index.css` (as CSS variables) and are named
in `frontend/tailwind.config.js`; the board's own copies are in
`frontend/src/constants.ts` (`BOARD`). Use the token name, never the hex
value, in components. A token's name is its role, not its hue: `paper` is
the page and `ink` what is written on it, whatever the palette makes them.

The frame is a storybook night: the grimoire's light becomes stars, gold
trims everything you can press, and the controls sit where a thumb expects
them. It takes its manners from action RPGs — a command list for spells,
gauges curved round a portrait — and keeps the charter's discipline about
what a colour may mean.

### 3.1 Colours

| Token | Hex | Meaning — and the only thing it may mean |
| --- | --- | --- |
| `night` | $\color{#070a1e}\blacksquare$ #070a1e | The deepest dark: dimmed backdrops, a gauge's empty track |
| `paper` | $\color{#0d1234}\blacksquare$ #0d1234 | The page behind every screen, with a few fixed stars |
| `panel` | $\color{#1a2258}\blacksquare$ #1a2258 | Cards, sheets and the command deck laid on the page |
| `board` / `board-alt` | $\color{#242e6a}\blacksquare$ #242e6a / $\color{#1e275e}\blacksquare$ #1e275e | Wells and slots inside a panel |
| `ink` | $\color{#eef1ff}\blacksquare$ #eef1ff | Text, and the light rim of a selected thing |
| `graphite` | $\color{#bec7ec}\blacksquare$ #bec7ec | Secondary text |
| `muted` | $\color{#8a97cc}\blacksquare$ #8a97cc | Labels, disabled, knocked out |
| `rule` / `hairline` | $\color{#3a468a}\blacksquare$ #3a468a / $\color{#28326e}\blacksquare$ #28326e | Dividers and cell strokes |
| `gold` | $\color{#ffd76a}\blacksquare$ #ffd76a | **The one call to action on a screen**, everything that is yours (your ring, your turn, the deck's spine), and the rim of a card or sheet |
| `vermilion` | $\color{#ff5a6e}\blacksquare$ #ff5a6e | **What your action is about to hit**, and the other side's ring. Nothing else. |
| `heart` | $\color{#ff7ab6}\blacksquare$ #ff7ab6 | Health, and a spell a dream has made stronger (3.5) |
| `pa` | $\color{#4fa3ff}\blacksquare$ #4fa3ff | Action points, wherever they are shown or changed |
| `pm` | $\color{#46e06a}\blacksquare$ #46e06a | Movement points, where you can walk, where you may start |

**A player does not pick a colour.** Whose fighter is whose is told by side,
not by player: the ring under your fighter and your dot in the turn order are
`gold` (`BOARD.socle.mine`), and the other side's are `vermilion`
(`BOARD.socle.theirs`). Two fighters in the same outfit therefore never share
a ring. Nothing tints a fighter's sprite: an outfit keeps its own trims. In a
fight between teams (Endless Dreams), your side is you and your allies: their
rings and dots are `gold` too, and where an ally fell their broken ring stays
on the board until they stand again.

**Elements have one colour and one icon each**, and they show wherever an
element does: spells, grimoires, sets, the wardrobe, the drums and wards they
leave on the board. The colours come from the grimoires' own sigils, and are
kept clear of vermilion and of the `pa` blue and `pm` green, so a number over
a fighter never reads as both damage and a stat. They are defined in
`frontend/src/utils/elements.ts` (with each element's pixel icon: a flame, a
gust, a drop, a stone, and a lighter `text` shade for words on the night) and,
for the spells the server paints, `backend/config/spells.json` ("elements");
keep the two in step.

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
| Display | **Philosopher**, bold | Names, titles, spell names, the numbers that matter (HP, timer) |
| Body | **Nunito** | Sentences: rules, lore, tooltips |
| Label | **Nunito** 800, uppercase, `tracking-label` (0.18em), 9–11 px | Every small label, counter and tag (`font-mono tracking-label`; the weight rides on `tracking-label` in `index.css`) |

Numbers that change during play use tabular figures (`tabular-nums`).

### 3.3 Shapes

- **Round, rimmed in gold.** Buttons are pills (`btn-gold`, `btn-night` in
  `index.css`); cards and sheets have large rounded corners and a gold rim
  (`border-gold/60`–`/70`). Dots, pips and badges are round.
- **Pressing sinks.** A button shrinks a little under the finger and comes
  back; nothing that cannot be pressed glows.
- **Shadows lift and glow.** A card over the board takes a deep night shadow;
  gold and pink may glow softly around the one thing they mark.
- **One gold button per screen state.** If two things want to be the gold
  pill, one of them is wrong. A forfeit is never the gold one.

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

### 3.5 The fight's controls

On a phone held sideways and on a desk alike (`GamePage`, `PhoneHud.tsx`):

- **The command deck**, down the left edge: every spell as a row with its
  glyph, its name and its cost, its spine gold. The picked spell slides out
  in gold behind a ♥ cursor. On a desk each row shows its number key, and
  resting the mouse on it opens its card; on a phone a long press does.
- **The portrait**, bottom right: health as the outer ring in `heart`,
  action points as the inner ring in `pa`, the health number in the middle,
  and the movement points beside it. The gold pill that ends the turn (or
  starts the fight) sits next to it.
- **A spell a dream has made stronger** wears a `heart` frame instead of the
  gold spine, a ✦ before its name, and what changed written under it
  ("−1 AP · +1 range"), read off the spell and the one it was made from
  (`utils/spellUpgrades.ts`). Its card says the same.
- A phone held upright keeps the bar under the board, in the same colours.
- **Nothing playable hides under a control.** The board starts where the
  deck ends, on a phone and on a desk.
- **The gold button carries the clock.** While it is your turn, the time
  left drains along its foot and turns vermilion for the last quarter; the
  phone buzzes once at ten seconds. "Your turn" shows large for a second as
  the turn comes round, and never takes a tap.
- **A finger feels the deck answer.** Picking or putting down a spell is a
  light haptic tick (`lib/native.ts`). Rows are 38 px tall.
- **The keyboard** (`utils/shortcuts.ts`), read by the key's position so a
  French keyboard works too: 1–9 pick a spell (again to put it down), Space
  does what the gold button does, Esc puts a spell down or opens the menu,
  L opens the menu, H lists the keys, and a right-click on the board puts a
  spell down. Wherever there is a keyboard, the controls show their key
  (`Keycap`).

---

## 4. The board in a fight

The board is part of the world, but it has to be read like a diagram. Until
section 11.1 is decided, it is drawn in the frame's night, a step lighter
than the page: blue cells with thin strokes, pale blue blocks for cover, and
**only two inks during a turn** — green (`pm`) for where you can walk and
vermilion for what your click will hit.

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
- **In a fight, a dream's monster is drawn as itself**, from its bestiary
  sheet, scaled up by a whole number with no smoothing so it lands on the
  fighters' pixel grid (a frame of 64 art pixels at four times a hero's
  scale). Its set only decides what it casts; the outfit's sheet is never
  drawn for it. The rulers still fight in their champion's sheet until they
  have fight sheets of their own (11.5).
- **A boon's rarity** is shown as one, two or three filled pips and its word
  (`common`, `rare`, `legendary`), never as a colour.

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
  name field, a starting cell to pick, the button to press) pulse slowly in
  gold, and stop as soon as they are answered.
- **World time** runs at 12 fps for sprites and effects and 10 fps for
  walking. Wind, water and glow keep moving at 30 fps while nothing else
  does.
- **Reduced motion is a known trade-off.** The frame's entrances (an
  overlay fading, a sheet sliding) are asked for with `motion-safe:` and stop
  under `prefers-reduced-motion`, but the fight
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
- An SVG colour that must follow a token is set as a style, not as a
  `fill`/`stroke` attribute: WebKit does not resolve `var()` in a
  presentation attribute.
- Touch targets are at least 36 px, and the board confirms a tap before it
  acts (`touchConfirm.ts`). A word that is a button keeps its small type and
  gets the target around it in padding.
- Body text on the night is `ink` or `graphite`; element names use their
  `text` shade, never `dark`.
- **Every overlay closes the same three ways**: a 40 px × in its corner, a
  tap on the dimmed page around it, and Escape (`components/Overlay.tsx`).
  Sheets slide in from the right and also go back with a swipe to the
  right. Only a question that must be answered, such as a fight's result,
  has no ×. A forfeit is never next to a close: the ways out of a fight sit
  at the foot of its menu, as buttons.

---

## 10. Checklist before a visual change ships

- [ ] Is it the world or the frame? It uses only that layer's tools.
- [ ] Every colour is a token, and every saturated colour means something the
      player acts on.
- [ ] At most one gold button on screen in this state, and vermilion only
      on what is about to be hit.
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
