/** @type {import('tailwindcss').Config} */

/*
 * The "Composée" palette: paper, ink, graphite and a single vermilion. Every
 * colour in the combat screen comes from here, so changing the look later is a
 * change to this file rather than a hunt through the components.
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
      colors: {
        paper: "#f2f2f0",
        panel: "#fbfbfa",
        board: "#ffffff",
        "board-alt": "#f4f4f2",
        ink: "#17181a",
        graphite: "#5f6260",
        muted: "#8b8d8a",
        rule: "#cfd0cd",
        hairline: "#e2e3e0",
        vermilion: "#d1462f",
        // Same hex as BOARD.pa/BOARD.pm in constants.ts, so a stat reads the
        // same colour in the combat log as it does in its floating number.
        pa: "#2f6fd1",
        pm: "#2f9e44",
        amber: "#b5790a",
        "amber-wash": "#f7ecd6",
      },
      fontFamily: {
        display: ["Archivo", "system-ui", "sans-serif"],
        sans: ['"Public Sans"', "system-ui", "sans-serif"],
        mono: ['"Azeret Mono"', "ui-monospace", "monospace"],
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
          "0%": { boxShadow: "0 0 0 0 rgba(209, 70, 47, 0.5)" },
          "70%": { boxShadow: "0 0 0 10px rgba(209, 70, 47, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(209, 70, 47, 0)" },
        },
        // A border pulsing between the paper's own rule and the one accent
        // colour, for a field that is still waiting to be typed into.
        hint: {
          "0%, 100%": { borderColor: "#cfd0cd" },
          "50%": { borderColor: "#d1462f" },
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
          "0%": { backgroundColor: "rgba(209, 70, 47, 0.10)" },
          "100%": { backgroundColor: "rgba(209, 70, 47, 0)" },
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
        // A burn that just got worse.
        "burn-pop": {
          "0%": { transform: "scale(1.6)" },
          "100%": { transform: "scale(1)" },
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
        "burn-pop": "burn-pop 0.35s ease-out 1",
      },
    },
  },
  plugins: [],
};
