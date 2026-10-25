/** @type {import('tailwindcss').Config} */

/*
 * The "Heart grimoire" frame: a storybook night, gold for what is yours and
 * for the one thing to press, a heart's pink for health. The colours
 * themselves live in index.css, as variables; this file only names them, so
 * changing the look is a change to one block rather than a hunt through the
 * components.
 */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      screens: {
        /*
         * A phone held upright. Tailwind turns its own max-* variants off as
         * soon as a raw screen exists, so this stands in for max-sm. It comes
         * before short so that, on a screen both narrow and short, short wins.
         */
        narrow: { max: "639px" },
        /*
         * A phone held sideways is the shape this board wants — wide and
         * shallow — but it leaves barely 300px of height once the browser's
         * own chrome is out. Everything in the HUD has a compact form here.
         */
        short: { raw: "(max-height: 560px)" },
        /*
         * A finger rather than a cursor: no hover to reveal a tooltip, and no
         * keyboard to press a number key on. Copy that talks about either is
         * swapped for copy that talks about tapping.
         */
        touch: { raw: "(hover: none) and (pointer: coarse)" },
      },
      /*
       * Every frame colour is a CSS variable (index.css), so the whole frame
       * changes palette from one place, and Tailwind's opacity modifiers
       * (bg-ink/40) still work on it. The names are the charter's roles, not
       * hues: `paper` is the page behind a screen, `ink` what is written on
       * it, `vermilion` what your action is about to hit — whatever colour
       * the current palette gives each of them.
       */
      colors: {
        paper: "rgb(var(--paper) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        board: "rgb(var(--board) / <alpha-value>)",
        "board-alt": "rgb(var(--board-alt) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        graphite: "rgb(var(--graphite) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        rule: "rgb(var(--rule) / <alpha-value>)",
        hairline: "rgb(var(--hairline) / <alpha-value>)",
        vermilion: "rgb(var(--vermilion) / <alpha-value>)",
        // Same hex as BOARD.pa/BOARD.pm in constants.ts, so a stat reads the
        // same colour in the combat log as it does in its floating number.
        pa: "rgb(var(--pa) / <alpha-value>)",
        pm: "rgb(var(--pm) / <alpha-value>)",
        amber: "rgb(var(--gold) / <alpha-value>)",
        "amber-wash": "rgb(var(--gold-wash) / <alpha-value>)",
        // The one call to action on a screen, and everything that is yours.
        gold: "rgb(var(--gold) / <alpha-value>)",
        "gold-deep": "rgb(var(--gold-deep) / <alpha-value>)",
        // A spell a dream's boons have made stronger.
        heart: "rgb(var(--heart) / <alpha-value>)",
        // Health, wherever it is counted: a vivid red, kept apart from the
        // orange vermilion of what a spell is about to hit.
        hp: "rgb(var(--hp) / <alpha-value>)",
        // The darkest night, under the page: wells, gauges' empty tracks.
        night: "rgb(var(--night) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Philosopher", "Georgia", "serif"],
        sans: ["Nunito", "system-ui", "sans-serif"],
        // The labels' face. It is no longer a monospace: the storybook frame
        // writes its small capitals in the body face, heavier (index.css).
        mono: ["Nunito", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        label: "0.18em",
      },
      /*
       * The moments the game has to ask something of a player without ever
       * saying so in words — the empty name field, the choice between the
       * two ways into a match, the cell still waiting to be picked, the
       * button waiting to be pressed. All four are a slow breath rather than
       * a blink: everything else on these screens holds still, so very
       * little movement is needed to be the thing that draws the eye. Every
       * one stops the instant the thing it was asking for happens — a
       * character typed, a cell chosen — because movement that outlives its
       * own question is just noise. The reduced-motion guard in index.css
       * switches all four off.
       */
      keyframes: {
        placeable: {
          "0%, 100%": { fillOpacity: "0.18" },
          "50%": { fillOpacity: "0.44" },
        },
        beckon: {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--gold) / 0.55)" },
          "70%": { boxShadow: "0 0 0 12px rgb(var(--gold) / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(var(--gold) / 0)" },
        },
        // A border pulsing between the paper's own rule and the one accent
        // colour, for a field that is still waiting to be typed into.
        hint: {
          "0%, 100%": { borderColor: "rgb(var(--rule))" },
          "50%": { borderColor: "rgb(var(--gold))" },
        },
        // The tutorial's arrow, pointing at whatever the card is talking
        // about. It is the only thing moving on a screen the player is being
        // asked to read, which is the whole reason it is noticed.
        nudge: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        // The combat log's newest line, so a player who glanced away for one
        // exchange still finds where the log picked back up.
        "log-settle": {
          "0%": { backgroundColor: "rgb(var(--gold) / 0.14)" },
          "100%": { backgroundColor: "rgb(var(--gold) / 0)" },
        },
        // The route an air spell takes through its relay, flowing forward.
        "wind-dash": {
          "0%": { strokeDashoffset: "34" },
          "100%": { strokeDashoffset: "0" },
        },
        // A burning fighter's flame, never quite still.
        flicker: {
          "0%, 100%": { transform: "scale(1, 1) rotate(-3deg)" },
          "50%": { transform: "scale(0.92, 1.12) rotate(3deg)" },
        },
        // An overlay arriving: the page dims, a card rises a few pixels and a
        // sheet slides in from the edge it goes back to. Short enough to be
        // over before a thumb can reach the card, and gone under reduced
        // motion (the components ask for them with motion-safe:).
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        // The deck coming awake as the turn comes round: each row slides
        // in from the edge and its spine lights, one after the other.
        wake: {
          "0%": { transform: "translateX(-10px)", filter: "brightness(1.8)" },
          "100%": { transform: "translateX(0)", filter: "brightness(1)" },
        },
      },
      animation: {
        placeable: "placeable 1.9s ease-in-out infinite",
        beckon: "beckon 1.6s ease-out infinite",
        hint: "hint 1.8s ease-in-out infinite",
        nudge: "nudge 1.4s ease-in-out infinite",
        "log-settle": "log-settle 2.4s ease-out 1",
        "wind-dash": "wind-dash 0.6s linear infinite",
        flicker: "flicker 0.45s ease-in-out infinite",
        "fade-in": "fade-in 160ms ease-out 1",
        rise: "rise 200ms cubic-bezier(.2,.8,.2,1) 1",
        "slide-in": "slide-in 220ms cubic-bezier(.2,.8,.2,1) 1",
        wake: "wake 420ms cubic-bezier(.2,.8,.2,1) 1 backwards",
      },
    },
  },
  plugins: [],
};
