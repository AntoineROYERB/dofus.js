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
| Quality | **always the highest**: every particle, every light, every layer. There is **no quality option** |
| Frame rate | **as smooth as a current mobile game**: the scene renders at the display's refresh rate, **60 fps held on a recent phone**, up to 120 Hz where the screen offers it |
| The scenery | **full**: every text cell on screen carries a glyph over a coloured ground, edge to edge, at every aspect ratio. No black gaps, no empty bands |
| Spell effects | **in ASCII too**, painted into the scene like everything else. Nothing is drawn on top in another style |
| Finish | **polished**: the look is part of the deliverable, not a later pass |

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
- Cell size (decided): the mock-up uses 5×9 px cells on a 300×130 grid. At
  740×360 a board cell is about 77 px wide (`fitTile`), so 20 glyphs per cell
  would make glyphs about 4×7 px, which read as texture rather than letters.
  On a phone a board cell is **about 12 glyphs wide** (glyphs of 6–7 px); on a
  desk, **20 or more**. The glyph cell is a whole number of device pixels;
  pinch zoom changes it in whole steps.

### 1.2 A world that fills the screen

A fight is no longer a diamond on paper: the scene fills the screen, and the
board is a clearing in it.

- **Full, edge to edge.** Every text cell on screen holds a glyph over a
  coloured ground: no black gap, no empty band, no bare backdrop. The scene is
  laid out wider and taller than any screen it may meet, so landscape,
  portrait and desktop all crop into scenery rather than run out of it. In
  portrait the extra height goes to more terraces at the back and more
  foreground at the bottom.
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
- **The back: a backdrop of its own for each island** (decided). It spans the
  whole width, in the island's palette, and keeps what makes the mock-up's
  wall work: a broken top line against the dark, openings onto darkness, and
  two light sources that throw stepped light on the ground. The mock-up's
  ruined wall (stone courses, arches, ivy, banners, braziers) is Prairie's.
  The others, as a starting point:
  - **Earth**: a basalt cliff in strata, magma veins in its cracks, fallen
    blocks at its foot;
  - **Water**: a drowned colonnade, two thin waterfalls, its arches half under
    the water;
  - **Ice**: frozen ramparts, icicles off the broken top, light through blue
    ice instead of braziers;
  - **Air**: broken arches standing on nothing over a sea of cloud, long
    pennants in the wind;
  - **Acid**: a fungal ruin, giant mushrooms and dripping vats glowing green;
  - **Fire**: a forge wall with lava falling through its arches.

  A backdrop is drawn the scene's way (materials, wind, light), is chosen by
  the island's palette id like the exploration's scenery, and never covers a
  playable cell.
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

#### ASCII figures: a format made to draw new characters easily

The existing sheets (256 px heroes, `public/bestiary/…`) carry colour only, and
shrink to about 30 px in the scene, where most of their detail is lost. Fighters
are instead drawn as **figures**, a format of their own made for this view:

- **Drawn at the scene's own resolution**, where one pixel is one glyph column
  (square pixels, a hero about 24×36, a monster about 14×14). What is drawn is
  what is shown; nothing is shrunk.
- **Painted in materials, not colours.** A figure uses only the colours of a
  fixed **material palette**, each exact colour standing for one material:
  outline, skin, hair, cloth and its shadow, trim, metal, leather, eye, glow,
  accent… The game gives each material its colour at draw time, from the
  outfit's element, the side's colour or the creature's palette. One figure
  makes every dye, and the ASCII pass knows what is an eye and what is a robe
  without guessing.
- **Any pixel editor works** (Aseprite, Piskel, LibreSprite): the palette ships
  as a file to load into it (`.gpl` and `.png`), and a figure is one PNG sheet:
  one column per frame, one row per animation (idle, walk, melee, ranged, hit,
  fall). Five directions are drawn (S, SE, E, NE, N); the other three are
  mirrored.
- **A small JSON beside it**: frame size, where the feet are, frames and rate
  per animation, and optionally a glyph set per material (a wool body in
  `% & o`, a slime in `O o °`).
- **Checked like content.** A Jest test reads every figure and refuses a colour
  outside the palette, a sheet that does not divide into frames, feet outside
  the frame, or a missing animation.
- **Seen before it ships**: a dev page (`?figure=<name>`) shows a figure in
  ASCII, every animation and direction, on each island's ground, in the wind,
  and reloads when the PNG changes.
- **Nothing is ever missing.** A fighter with no figure yet is drawn from its
  existing sheet, its materials guessed from the pixels (edge against
  transparency → outline, small very bright spots → eyes and glows, the rest
  → body). The figure replaces it as soon as it exists.
- The four outfit families and the thirteen creatures (five of them bosses)
  each need a figure. Step 1 ships the format, the palette, the check, the
  preview, the fallback, and **one figure drawn by hand as the reference**: the
  Pyromancer of the character study.

#### On the board

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

- **No Quality option** (decided). The fight always runs at its highest
  quality: every particle, every light, at the display's refresh rate. The
  only saving is to stop drawing when the tab is hidden or the fight is
  behind an overlay that covers it.

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
- **The whole frame must hold 60 fps on a recent phone**, like a current mobile
  game, and follow the display up to 120 Hz where it offers more. The mock-up
  takes about 96 ms per frame in JavaScript on a laptop, more than ten times
  too slow. Budget: **8 ms or less of work per frame on a recent phone**
  (scene, light and ASCII pass together), which leaves the browser the rest of
  the 16.6 ms. Approaches, in order:
  - **WebGL2 is the path the game is built for**: the scene and the material
    map as textures, and a fragment shader that picks each glyph from a
    pre-rendered **glyph atlas**, with light, haze, reflections and the neon
    glow in shaders too. The per-frame JavaScript only updates what moved;
  - a **Canvas 2D fallback** draws from the same atlas (`drawImage`, never
    `fillText` per cell), for devices without WebGL2. It shows the same
    picture at whatever rate the device holds; it is not where the 60 fps is
    measured;
  - **cache** everything that does not move: the ground, the terraces, the
    wall, objects at rest. Only wind, water, light, particles, effects and
    fighters are repainted;
  - no rate cap below the display's; **stop when the tab is hidden**.
- **Motion runs on real time, not on frames.** Wind, water, particles, light,
  the neon's breath, walks and the camera are functions of elapsed time, so
  they are smooth at 60 or 120 Hz and the same speed at either. Sprite sheets
  keep their own frame rate (they are drawn that way); everything around them
  is fluid.
- The neon keeps its glow: in WebGL, blur the edge mask only; in Canvas 2D, use
  `shadowBlur` on edge glyphs only.
- **Spell effects** (`SpellFXLayer`, `vfx/`, the grimoires' sheets and the
  procedural fallbacks) are painted into the scene, so they turn into glyphs
  too, with materials of their own (fire, spark, smoke, water, stone, wind) and
  their light thrown on the ground around them. **Decided:** nothing stays on
  top in another style once the fight ships in ASCII.
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
- Section 7: spell effects are painted into the scene and shown as glyphs.
- Section 8: the fight renders at the display's rate (60 fps held on a recent
  phone); wind, water, light and particles move on real time; sprite sheets
  keep their own frame rate.

## 6. Tests and checks

- **Jest, without a DOM** (in `utils/` or the new module):
  - the edge glyph chosen for a given line height;
  - material priority;
  - which colour an edge takes between two cells;
  - scenery determinism (same seed, same scenery);
  - the "nothing tall in the first ring" rule;
  - every figure: palette colours only, whole frames, feet inside the frame,
    every animation present;
  - the fallback's material guess on a small hand-made sheet;
  - the cells highlighted for a given spell, which must equal what `reachable`
    and `sightBlockedBy` give.
- **What CI runs**: `npm test`, `npm run lint` and `npm run build`. Nothing
  moves on the Go side: `go test -race ./...` passes without `-update`.
- **In the browser, against a server from the same branch**, in 740×360
  landscape, in portrait and on desktop: a fight on every island, walking,
  aiming each of the four spells, an opponent's turn, and the end of the fight.
  Measure frame time on a phone or with CPU throttling: the 60 fps target is
  checked against the frame times, not by eye. A `?fps` overlay shows the
  frame time and the share of frames over 16.6 ms, so it can be read on a
  real phone through the dev server on the local network.

## 7. Decisions with the maintainer

Decided:

1. **Quality**: no option; always the highest (section 3.3).
2. **Frame rate**: the display's rate, 60 fps held on a recent phone (section 4).
3. **Spell effects**: in ASCII, painted into the scene (section 4).
4. **Scenery**: full, edge to edge, at every aspect ratio (section 1.2).
5. **The back**: a backdrop of its own for each island (section 1.2).
6. **Glyph size**: about 12 glyphs per board cell on a phone, 20 or more on a
   desk (section 1.1).
7. **Characters**: a figure format of their own, drawn in materials, so new
   ones are easy to make; the existing sheets are only the fallback
   (section 1.4).

8. **The scenery's seed**: the island, the `roomId` and a hash of the dealt
   ground, read sorted (`world/seed.ts`). The server does not move.

Found while building step 1:

- On a desk window that leaves the board small, twenty glyphs a cell would
  be under 3 px each: a glyph is never narrower than 5 CSS pixels, and a
  small board gets fewer, larger glyphs per cell.
- A phone held sideways fills its height with the board, so the backdrop
  shows in the two upper corners, its foot two rings behind the board's back
  edges; a taller screen shows it across the top.
- The world's canvas is fixed over the whole viewport and lines itself up
  with the board's container, so it runs edge to edge under the deck and the
  disc without moving them; step 4 moves the controls onto it.

## 8. Delivery

One pull request per step, each branched from `origin/develop` and opened
against `develop` once the maintainer agrees:

1. **The scene and the ASCII pass** (WebGL2 plus fallback, glyph atlas): full
   ground edge to edge, terraces, plinth, each island's backdrop, ponds,
   deterministic scenery, the figure format (palette, check, preview,
   fallback, the Pyromancer), wind, light and particles, at 60 fps with the
   frame-time measurement. It replaces the current board drawing, and the
   charter changes with it. Today's marks stay on top until step 3, so the
   game stays playable.
2. **Spell effects in ASCII**: the grimoires' sheets and the procedural
   effects painted into the scene, with their light. `SpellFXLayer` stops
   drawing on top.
3. **The neon grid**, wired to the existing utilities, with its tests.
4. **The phone interface** (landscape, then portrait).
5. **The desktop interface**.

`develop` is not what Render deploys, so it may hold the first steps; `main`
should take the fight's ASCII look once steps 1 to 3 are in.
