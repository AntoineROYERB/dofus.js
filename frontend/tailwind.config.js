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
         * A phone held sideways is the shape this board wants — wide and
         * shallow — but it leaves barely 300px of height once the browser's
         * own chrome is out. Everything in the HUD has a compact form here.
         */
        short: { raw: "(max-height: 560px)" },
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
      },
      animation: {
        placeable: "placeable 1.9s ease-in-out infinite",
        beckon: "beckon 1.6s ease-out infinite",
        hint: "hint 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
