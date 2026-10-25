# Recorded sounds

Everything else the game plays is synthesised in `frontend/src/audio/`.
These recordings were trimmed, loudness-matched and re-encoded as MP3.

## Cries — `cries/`

"Male Grunt/Yelling sounds" by **HaelDB**, released under **CC0** (also
offered as OGA-BY 3.0).
<https://opengameart.org/content/male-gruntyelling-sounds>

The files are renamed `v<voice>-<original name>`: `v1` to `v3` are the
vocalists whose original names start with 1, 2 and 3, and `v4` the one with
no number. Five long, steady battle shouts were left out (2yell6, 3yell9,
3yell13, 3yell16, yell1).

## Spells — `spells/`

"8 Magic Attacks" by **leohpaz** (Leohpaz), licensed under
**CC BY 4.0** — <https://creativecommons.org/licenses/by/4.0/>.
<https://opengameart.org/content/8-magic-attacks>

| File | Original |
| --- | --- |
| `fire.mp3` | 04_Fire_explosion_04_medium |
| `ice.mp3` | 13_Ice_explosion_01 |
| `thunder.mp3` | 18_Thunder_02 |
| `water.mp3` | 22_Water_02 |
| `wind.mp3` | 25_Wind_01 |
| `earth.mp3` | 30_Earth_02 |
| `charge.mp3` | 45_Charge_05 |
| `poison.mp3` | 46_Poison_01 |

Changes: leading silence trimmed, loudness normalised, re-encoded as MP3.

## Monsters — `creatures/`

Both packs are released under **CC0**.

- `ogre-*`: "Monster Sound Effects Pack" by **Ogrebane** —
  <https://opengameart.org/content/monster-sound-effects-pack>
  (`ogre-N` is the pack's `monster-N`).
- `duck-*`: "80 CC0 creature SFX #2" by **rubberduck** —
  <https://opengameart.org/content/80-cc0-creture-sfx-2>
  (`duck-die1` is `die_01`, `duck-roar4` is `roar_04`, `duck-monster8` is
  `monster_08`, and so on).

Monsters growl with the short ones when hit, and die with `die_*`,
`roar_*`, the longest `monster_*` and `ogre-6`/`ogre-8`.
Changes: silence trimmed, loudness normalised, mono, re-encoded as MP3.
