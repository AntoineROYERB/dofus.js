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
    },
  },
  plugins: [],
};
