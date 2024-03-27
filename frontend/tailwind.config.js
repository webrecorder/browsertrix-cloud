const Color = require("color");
const { tailwindTransform } = require("postcss-lit");

const PRIMARY_COLOR = "#4876ff";
const primaryColor = Color(PRIMARY_COLOR);

const primary = {
  DEFAULT: PRIMARY_COLOR,
  50: primaryColor.lighten(0.54).hex(),
  100: primaryColor.lighten(0.5).hex(),
  200: primaryColor.lighten(0.4).hex(),
  300: primaryColor.lighten(0.3).hex(),
  400: primaryColor.lighten(0.2).hex(),
  500: primaryColor.lighten(0.1).hex(),
  600: PRIMARY_COLOR,
  700: primaryColor.darken(0.1).hex(),
  800: primaryColor.darken(0.2).hex(),
  900: primaryColor.darken(0.3).hex(),
  950: primaryColor.darken(0.4).hex(),
};

/**
 * Use Shoelace CSS variables in Tailwind theme for consistency
 *
 * Customize Shoelace variables in `theme.ts`
 * @returns {import('tailwindcss').Config['theme']}
 */
function makeTheme() {
  // Map color palettes:
  const colors = [
    "gray",
    "red",
    "yellow",
    "green",
    "blue",
    "indigo",
    "purple",
    "pink",
    "orange",
  ];
  // Map color grading:
  const colorGrades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

  /**
   * @param {string} color
   * @returns {Record<string, string>}
   */
  const makeColorPalette = (color) =>
    colorGrades.reduce(
      /**
       * @param {Record<string, string>} acc
       * @param {number} v
       * @returns
       */
      (acc, v) => ({
        ...acc,
        [v]: `var(--sl-color-${color}-${v})`,
      }),
      {},
    );

  return {
    // https://github.com/tailwindlabs/tailwindcss/blob/52ab3154392ba3d7a05cae643694384e72dc24b2/stubs/defaultConfig.stub.js
    colors: {
      current: "currentColor",
      ...colors.map(makeColorPalette),
      primary,
      success: { ...makeColorPalette("success"), DEFAULT: `var(--success)` },
      warning: { ...makeColorPalette("warning"), DEFAULT: `var(--warning)` },
      danger: { ...makeColorPalette("danger"), DEFAULT: `var(--danger)` },
      neutral: {
        ...makeColorPalette("neutral"),
        // Shoelace supports additional neutral variables:
        0: `var(--sl-color-neutral-0)`,
        950: `var(--sl-color-neutral-950)`,
        1000: `var(--sl-color-neutral-1000)`,
      },
    },

    fontFamily: {
      sans: `var(--sl-font-sans)`,
      serif: `var(--sl-font-serif)`,
      mono: `var(--sl-font-mono)`,
    },
    fontSize: {
      xs: ["var(--sl-font-size-x-small)", { lineHeight: "1.33" }],
      sm: ["var(--sl-font-size-small)", { lineHeight: "1.25rem" }],
      // base: ["var(--sl-font-size-medium)", { lineHeight: "1.5" }],
      lg: ["var(--sl-font-size-large)", { lineHeight: "1.6" }],
      xl: ["var(--sl-font-size-x-large)", { lineHeight: "1.5" }],
      "2xl": ["var(--sl-font-size-2x-large)", { lineHeight: "1.5" }],
      "3xl": ["var(--sl-font-size-3x-large)", { lineHeight: "1" }],
      "4xl": ["var(--sl-font-size-4x-large)", { lineHeight: "1" }],
    },
    fontWeight: {
      light: "var(--sl-font-weight-light)",
      normal: "var(--sl-font-weight-normal)",
      medium: "var(--sl-font-weight-medium)",
      semibold: "var(--sl-font-weight-semibold)",
      bold: "var(--sl-font-weight-bold)",
    },
    borderRadius: {
      sm: `var(--sl-border-radius-small)`,
      DEFAULT: `var(--sl-border-radius-medium)`,
      md: `var(--sl-border-radius-medium)`,
      lg: `var(--sl-border-radius-large)`,
      xl: `var(--sl-border-radius-x-large)`,
    },
    // TODO see if there's a way to use Shoelace's box shadows with customizable colors
    // boxShadow: {
    //   sm: `var(--sl-shadow-small)`,
    //   DEFAULT: `var(--sl-shadow-medium)`,
    //   md: `var(--sl-shadow-medium)`,
    //   lg: `var(--sl-shadow-large)`,
    //   xl: `var(--sl-shadow-x-large)`,
    // },
    aspectRatio: {
      "4/3": "4 / 3", // For Browsertrix watch/replay
    },
    gridTemplateColumns: {
      13: "repeat(13, minmax(0, 1fr))",
      14: "repeat(14, minmax(0, 1fr))",
    },
    screens: {
      desktop: "82.5rem", // 14 4.5rem columns with 1.5rem gutter
      // Override default of:
      // => @media (min-width: 1024px) { ... }
    },
    transitionDuration: {
      "x-slow": "var(--sl-transition-x-slow)",
      slow: "var(--sl-transition-slow)",
      medium: "var(--sl-transition-medium)",
      fast: "var(--sl-transition-fast)",
      "x-fast": "var(--sl-transition-x-fast)",
    },
    outlineWidth: {
      3: "3px",
    },
    outlineOffset: {
      3: "3px",
    },
  };
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: makeTheme(),
  },

  content: {
    files: ["./src/**/*.html", "./src/**/*.{ts,js,ejs}"],
    transform: {
      ts: tailwindTransform,
    },
  },

  extract: {
    include: ["./src/**/*.{ts,js}"],
  },

  plugins: [require("@tailwindcss/container-queries")],
};
