# Plan — The fight as a living ASCII world

Status: **to implement**. The reference mock-up is
[`docs/prototypes/fight-board-ascii.html`](../prototypes/fight-board-ascii.html),
a standalone page: open it in a browser, press 1 to 4 to pick a spell, and hover
Ashka to see where he can walk. The first character study is
[`docs/prototypes/pyromancer-ascii.html`](../prototypes/pyromancer-ascii.html).

The mock-up is a **visual and behavioural reference, not code to copy**. It
re-implements in JavaScript rules the client already has (range, line of sight,
paths), it draws procedural characters instead of the real sprite sheets, and it
runs at about 10 frames a second on a laptop. The game takes its look, not its
structure. Its "Pixel view" button is a debugging aid that shows the scene
before it is turned into glyphs; the game has **no pixel view**.

## 0. Decisions

| Topic | Decision |
|---|---|
| What changes | **how a fight is drawn, and its interface**, on the client only |
| What does not change | the server, the rules, `rulesFingerprint`, the replays, the `board.ts` / `ground.ts` mirrors |
| The board | stays **flat** and readable; height exists only **around** it |
| The look | **ASCII only**. There is no pixel view and no option to switch |
| The grid | **hidden at rest**; it appears to walk (green) and to aim (vermilion), as **neon** |
| Priority | **phone first** (landscape 740×360, then portrait), then desktop |
| Language | every new string goes through `t("…")`, with its French in `i18n/fr.ts` |

## 1. What the player sees

### 1.1 How the picture is made

The scene is painted once per frame at art resolution into an off-screen
buffer: colour, **material**, and for the board the edge colour and priority of
each highlighted cell. That buffer is never shown. The **ASCII pass** reads it:
each text cell looks at the pixels it covers, keeps the **most important
material** (eyes and the staff win over the robe, the robe over the grass),
and draws **one glyph** of that material, in that material's colour, over **a
background** of the ground's colour.

- The mock-up's glyph sets are the reference: grass `| ' " , ;` bending into
  `/` under a gust, water `~ -`, bricks `# = %`, foliage `# & *` by light,
  pines `A ^ '`, outlines `@`, eyes `o` / `●`, fire `^ * # @`, and so on.
- The glyphs are **lifted at display**: glyph colours ×1.35 and backgrounds
  ×1.7, with the shadows raised slightly. Without the lift the view is too dark,
  because the gaps between letters lose light.
- Cell size: the mock-up uses 5×9 px cells on a 300×130 grid. On a phone, pick
  the cell size so that a board cell is at least about 20 glyphs wide; pinch
  zoom changes the cell size in whole steps.

### 1.2 A world that fills the screen

A fight is no longer a diamond on paper: the scene fills the screen, and the
board is a clearing in it.

- **Full ground.** Three tones per island in soft patches, worn earth, flowers,
  pebbles, and grass wherever the island grows any (density per island:
  Prairie 1, Air and Acid 0.8, Water 0.7, Earth 0.35, Ice and Fire 0). On the
  board the grass is shorter so cells stay readable.
- **Height, around the board only.** The land climbs in terraces towards the
  back, drops one step in front of the board, and sinks under the ponds. Each
  step shows its face: a lip of grass, then earth and stone in strata, lit on
  the left and in the shade on the right. The board stands on a **stone
  plinth** whose brick face shows wherever the ground falls away. Heights can
  come from the terrace code already written for exploration
  (`explore/world.ts`, `heightAt`, `MAX_LEVEL`) or a shared equivalent.
- **The back.** A ruined wall across the whole width: stone courses, a broken
  top, arches open onto darkness, ivy, two banners in the island's colours, and
  two lit braziers.
- **Ponds.** Two sunken ponds in the front corners that **reflect** what grows
  on their banks, with a ripple, and glint. Lava on Fire, acid on Acid, ice on
  Ice.
- **Depth.** A cool **haze**, in steps, that thickens towards the back. **Cast
  shadows** fall down and to the right, since light comes from the upper left as
  the charter says. Large **dark ferns in the foreground** sit at the bottom of
  the frame, and the edges darken in steps.
- **Light**, in steps, never as a smooth gradient: the staff's flame, the
  braziers, lava, acid, and the fire that spells leave behind.

### 1.3 Everything moves

- **One wind for the whole scene**, a function of column, row and time. Grass
  bends and brightens as a gust passes, then stands back up. Trees, pines,
  bushes, tall grass, banners and ferns follow the same gusts, more at the top
  than at the foot.
- Leaves **catch the light** for a moment, and some **come loose** and drift
  down on the wind.
- **Each island has its own air**: fireflies (Prairie), dust (Earth), drizzle
  (Water), snow (Ice), petals (Air), spores (Acid), embers (Fire).
- Scenery is **deterministic**: it is seeded from the island and the match id
  on the client, never from `g.rng`. Two players in the same fight see the same
  scenery, and a reload does not change it.
- Scenery **never hides a playable cell**: nothing tall stands in the first
  ring around the board, and nothing tall stands in front of it.

### 1.4 Characters

- Keep **the real sprite sheets** (`public/animation/outfits/…`,
  `public/bestiary/…`, `explore/sprites.ts`). They are painted into the scene at
  art resolution, so the ASCII pass turns them into glyphs like everything
  else.
- **Sizes**: a bestiary monster fits inside one cell (the mock-up's sheep was
  far too big at first); a hero stands about two cells tall.
- **Idle life**: a one-pixel breath, a hem that follows the wind, blinking
  eyes, a hop for small creatures, a hover for flying ones.
- Above each fighter: their name, a short health bar, their burns (▲), and the
  damage numbers that rise when they are hit.

### 1.5 The neon grid

- **No grid at rest.** The ground is just ground.
- **To walk**: reachable cells are outlined in **green** (`pm`), and the path to
  the aimed cell glows brighter.
- **To aim**: the spell's range is outlined in **vermilion**, cells in range but
  out of sight in **greyed vermilion** (`blind`), and the area under the finger
  or the cursor lights up fully. The caster's own cell is edged in ink.
- **Neon**: a thick line with a near-white core and a halo of its own colour,
  and the ground one row either side takes its tint, so the light spills onto
  the scenery instead of sitting on top of it. It **breathes** gently
  (intensity between 0.8 and 1).
- The line follows the 2:1 slope as a staircase `▁ ━ ▔`. The glyph depends on
  the height at which the line crosses the text cell; see `edgeAt` in the
  mock-up.
- Between a highlighted cell and a plain one, the line takes the colour of the
  louder one: area > path > range > out of sight.
- Highlighted cells **come only from existing client state**: `reachable`,
  `blockedBy`, `sightBlockedBy` (`utils/board.ts`), `outOfSight`, `castOrigin`
  (`utils/spellUtils.ts`), and the areas already computed for today's marks.
  Nothing is recomputed separately.

## 2. Interaction

Today's flow stays the same: aim, then confirm under the thumb (charter 3.5,
`autoTarget.ts`, `touchConfirm.ts`).

- **Phone** (no hover):
  - picking a spell arms it and aims it at once at the most sensible cell, as
    today; the range and the area appear;
  - with no spell, **tapping your own fighter** shows the walking grid; tapping
    a reachable cell aims at it (path lit), and the gold disc says "Move" with
    the cost;
  - the disc confirms, and so does a second tap on the same cell.
- **Desktop** adds hover: hovering your fighter or a reachable cell shows the
  walking grid and the path, and with a spell picked, hovering moves the area.
  Right-click or Escape puts the spell down.
- Picking a cell reads the **board's ground** (`screenToIso`), including when
  the finger lands on a fighter's body, which counts as its cell, as today.

## 3. Interface

The interface stays the charter's "Heart grimoire" frame (fonts, tokens, one
gold button per state), adapted to a dark, full-screen ASCII world. It must
stay **pleasant to use**: readable at a glance, everything under a thumb, and
nothing playable under a control.

### 3.1 Phone first (landscape 740×360, then portrait)

- The world takes **the whole screen**. Controls float over it on dark
  translucent plates (`night` at about 85 %) edged with a `rule` line, so they
  stand out from busy scenery without cutting it off.
- **Framing** always keeps the whole board clear of the controls: the deck on
  the left, the disc and the portrait at the bottom right, and the screen's
  notches. Scenery may pass under the controls; a cell may not.
- **The deck** (left edge) keeps its 38 px rows, glyphs and costs. When the
  screen is short (`compact`, height ≤ 560 px) it can shrink to its glyphs and
  open with a swipe.
- **The gold disc** and **the portrait** stay at the bottom right. Action and
  movement points are shown as crisp numbers, in the charter's mono label style.
- **The island legend** (`IslandLegend`) becomes a collapsible chip at the top
  left: the island's name and its terrain marks; a tap opens the sentences.
- **The log and the turn timeline** stay behind their sheet, as they do today
  below `lg`.
- **Portrait**: the bar stays under the board, and the world fills everything
  above it.
- **Pinch to zoom** (`usePinchZoom`, `utils/camera.ts`) changes the glyph cell
  size in whole steps, never continuously.

### 3.2 Desktop

- Same layout as landscape, with more room: the world full-screen, the board
  centred, the deck on the left with its number keys (1–9), the disc and
  portrait at the bottom right, and the log as a side panel.
- Hover opens spell and cell cards, as today.
- The existing shortcuts stay (`utils/shortcuts.ts`).

### 3.3 Options

- Possibly a **Quality** option: High (about 24 fps, all particles) or Saver
  (about 12 fps, half the particles), for phone batteries. To confirm
  (section 7).

## 4. Client architecture

- **A scene renderer** (for example `components/Game/World/`) replaces what
  draws the board's background today: `GroundLayer`, the cell drawing in
  `Tile`, and the ground in `TerrainLayer`. Everything is drawn in a single
  canvas. What stays interactive (picking, tooltips, clickable rings) can stay
  in the DOM on top, transparent.
- **Three passes**, as in the mock-up:
  1. **the scene**, at art resolution, off-screen: colour, material, and the
     board's edge colours and priorities;
  2. **light**: stepped sources, haze, edge darkening, reflections;
  3. **the ASCII pass**, which is the only thing on screen.
- **The ASCII pass must run on a phone.** The mock-up takes about 96 ms per
  frame in JavaScript on a laptop, which is far too slow. Target: **8 ms or less
  per frame on a recent phone**. Approaches, in order:
  - **WebGL2**: the scene and the material map as textures, and a fragment
    shader that picks each glyph from a pre-rendered **glyph atlas**. Keep a
    Canvas 2D fallback that draws from the same atlas (`drawImage`, never
    `fillText` per cell);
  - **cache** everything that does not move: the ground, the terraces, the
    wall, objects at rest. Only wind, water, light, particles and fighters are
    repainted;
  - cap the rate (12 to 24 fps depending on quality), and **stop when the tab
    is hidden**.
- The neon keeps its glow: in WebGL, blur the edge mask only; in Canvas 2D, use
  `shadowBlur` on edge glyphs only.
- **Spell effects** (`SpellFXLayer`, `vfx/`) are painted into the scene, so they
  turn into glyphs too. If that does not fit the first release, they can stay
  on top for one step, but the target is ASCII everywhere (section 7).
- **Reduced motion**: the fight deliberately ignores `prefers-reduced-motion`
  (`utils/motion.ts`). Do not add a damped path without reading that file.

## 5. The charter

This look departs from the current charter, so `docs/ART_DIRECTION.md` must
change **in the same pull request** as the code that draws it.

- Section 4: the board becomes a clearing in a full-screen ASCII world; the
  grid is hidden at rest and drawn as neon.
- Section 5 ("one brush"): in a fight, the pixel art is an intermediate step
  that the player never sees; what is shown is its ASCII rendering.
- Section 11.1 is **decided**: the board's ground and cover join the world, and
  the whole fight is shown in ASCII.
- A new "ASCII view" subsection: glyph sets per material, the display lift,
  cell size per screen.
- The deliberate exception: **the grid's neon is the only soft glow allowed**
  in the world.
- Section 8: the wind and its frame rate.

## 6. Tests and checks

- **Jest, without a DOM** (in `utils/` or the new module):
  - the edge glyph chosen for a given line height;
  - material priority;
  - which colour an edge takes between two cells;
  - scenery determinism (same seed, same scenery);
  - the "nothing tall in the first ring" rule;
  - the cells highlighted for a given spell, which must equal what `reachable`
    and `sightBlockedBy` give.
- **What CI runs**: `npm test`, `npm run lint` and `npm run build`. Nothing
  moves on the Go side: `go test -race ./...` passes without `-update`.
- **In the browser, against a server from the same branch**, in 740×360
  landscape, in portrait and on desktop: a fight on every island, walking,
  aiming each of the four spells, an opponent's turn, and the end of the fight.
  Measure frame time on a phone or with CPU throttling.

## 7. To confirm with the maintainer before coding

1. A **Quality** option for phones: yes or no?
2. **The ruined wall**: the same everywhere (in the island's colours), or a
   backdrop of its own for each island?
3. **Spell effects** in ASCII from the first release, or one step later?

## 8. Delivery

One pull request per step, each branched from `origin/develop` and opened
against `develop` once the maintainer agrees:

1. **The scene and the ASCII pass** (WebGL plus fallback, glyph atlas): full
   ground, terraces, plinth, wall, ponds, deterministic scenery, real sprite
   sheets, wind, with the frame-time measurement on a phone. It replaces the
   current board drawing, and the charter changes with it.
2. **The neon grid**, wired to the existing utilities, with its tests.
3. **The phone interface** (landscape, then portrait).
4. **The desktop interface**.
5. **Spell effects in ASCII**, if they did not make step 1.
