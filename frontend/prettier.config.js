/** @type {import("@ianvs/prettier-plugin-sort-imports").PrettierConfig} */
module.exports = {
  plugins: [
    "@ianvs/prettier-plugin-sort-imports",
    "prettier-plugin-tailwindcss",
  ],
  tailwindFunctions: ["tw"],
  importOrder: [
    "<BUILTIN_MODULES>",
    "",
    "<THIRD_PARTY_MODULES>",
    "",
    // Parent directory items
    "^\\.\\.$",
    "^\\.\\.(/.+)$",
    "",
    // This directory items
    "^\\.(/.+)$",
    "",
    "^\\.$",
    "",
    "^@/(.*)$",
    "^~assets/(.*)",
    "",
  ],
  importOrderParserPlugins: ["typescript", "decorators-legacy"],
  importOrderTypeScriptVersion: "5.0.0",
};
