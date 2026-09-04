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
       * The two moments the game has to ask something of a player who has
       * only just arrived: choose a cell, then commit it. Both are a slow
       * breath rather than a blink — the board is quiet everywhere else, so
       * very little movement is needed to be the thing that draws the eye.
       * The reduced-motion guard in index.css switches both off.
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
      },
      animation: {
        placeable: "placeable 1.9s ease-in-out infinite",
        beckon: "beckon 1.6s ease-out infinite",
      },
    },
  },
  plugins: [],
};
