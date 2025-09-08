/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{ts,tsx}",
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        panel: "var(--panel)",
        panel2: "var(--panel-2)",
        ink: "var(--ink)",
        "ink-dim": "var(--ink-dim)",
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        ok: "var(--ok)",
        warn: "var(--warn)",
        err: "var(--err)",
        stroke: "var(--stroke)",
        "stroke-2": "var(--stroke-2)",
        grid: "var(--grid)",
        "grid-strong": "var(--grid-strong)",
        chip: "var(--chip)",
        "chip-border": "var(--chip-border)",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm: "var(--radius-sm)",
      },
      boxShadow: {
        lift: "var(--shadow)",
      },
    },
  },
  plugins: [],
};


